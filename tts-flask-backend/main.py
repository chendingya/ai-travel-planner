import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import dashscope
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

from langchain.agents.middleware import AgentMiddleware
from langchain.tools.tool_node import ToolCallRequest
from langchain.messages import ToolMessage
from langgraph.types import Command
from typing import Callable, Awaitable, Dict, List

class ToolErrorHandlerMiddleware(AgentMiddleware):
    """处理工具错误，并让模型重新尝试"""
    
    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage | Command],
    ) -> ToolMessage | Command:
        """在工具调用周围包装错误处理"""
        try:
            print(f"🔧 执行工具: {request.tool_call['name']}")
            print(f"📝 参数: {request.tool_call['args']}")
            
            result = handler(request)
            print(f"✅ 工具执行成功")
            return result
            
        except Exception as e:
            error_msg = (
                f"工具 '{request.tool_call['name']}' 执行失败。\n"
                f"错误: {str(e)}\n"
                f"请检查参数并重新尝试"
            )
            print(f"❌ 工具错误: {error_msg}")
            
            # 返回ToolMessage，让模型继续处理
            return ToolMessage(
                content=error_msg,
                tool_call_id=request.tool_call["id"],
                name=request.tool_call["name"]
            )

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command]],
    ) -> ToolMessage | Command:
        """异步包装工具调用，确保在ainvoke场景正常运行"""
        try:
            print(f"🔧 执行工具: {request.tool_call['name']}")
            print(f"📝 参数: {request.tool_call['args']}")

            result = await handler(request)
            print(f"✅ 工具执行成功")
            return result

        except Exception as e:
            error_msg = (
                f"工具 '{request.tool_call['name']}' 执行失败。\n"
                f"错误: {str(e)}\n"
                f"请检查参数并重新尝试"
            )
            print(f"❌ 工具错误: {error_msg}")

            return ToolMessage(
                content=error_msg,
                tool_call_id=request.tool_call["id"],
                name=request.tool_call["name"]
            )

# 加载环境变量
load_dotenv()

# 设置DashScope API URL
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

app = Flask(__name__)

# 初始化MCP客户端（在应用启动时）
mcp_client = None

# 简易会话存储（内存级，重启即失），按conversation_id分组
conversation_sessions: Dict[str, List[dict]] = {}
MAX_HISTORY_MESSAGES = int(os.getenv('AI_CHAT_HISTORY_LIMIT', '12'))  # 总消息上限


def get_conversation_history(conversation_id: str) -> List[dict]:
    """获取指定会话的历史消息列表"""
    return conversation_sessions.setdefault(conversation_id, [])


def trim_conversation_history(history: List[dict]) -> None:
    """限制历史长度，避免无限增长"""
    if len(history) > MAX_HISTORY_MESSAGES:
        # 仅保留最近的若干条消息
        history[:] = history[-MAX_HISTORY_MESSAGES:]

@app.before_request
async def init_mcp():
    global mcp_client
    if mcp_client is None:
        mcp_client = MultiServerMCPClient({
            "12306-mcp": {
                "transport": "stdio",
                "command": "npx",
                "args": ["-y", "12306-mcp"],
            },
            "bing-cn-mcp-server": {
                "transport": "sse",
                "url": "https://mcp.api-inference.modelscope.net/23494d15514349/sse",  # 远程MCP服务器
            }
        })


CORS(app)  # 允许跨域请求

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({'status': 'ok'})

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """文字转语音API"""
    try:
        data = request.get_json()
        
        # 获取请求参数
        text = data.get('text', '')
        voice = data.get('voice', 'Cherry')
        language_type = data.get('language_type', 'Chinese')
        
        if not text:
            return jsonify({
                'error': 'Missing text',
                'message': '请提供要转换的文本内容'
            }), 400
        
        # 检查API Key
        api_key = os.getenv('DASHSCOPE_API_KEY')
        tts_model = os.getenv('DASHSCOPE_TTS_MODEL', 'qwen3-tts-flash')
        if not api_key:
            return jsonify({
                'error': 'TTS功能不可用',
                'message': '系统管理员需要配置DashScope API密钥才能使用语音合成功能'
            }), 500
        
        print(f"🗣️ 正在调用通义千问TTS API...")
        print(f"📝 文本长度: {len(text)} 字符")
        print(f"🎤 音色: {voice}")
        print(f"🌐 语言: {language_type}")
        
        # 调用DashScope TTS API
        response = dashscope.MultiModalConversation.call(
            model=tts_model,
            api_key=api_key,
            text=text,
            voice=voice,
            language_type=language_type,
            stream=False
        )
        
        print(f"✅ TTS任务创建成功")
        print(f"📋 响应内容: {response}")
        
        return jsonify({
            'taskId': response.output.task_id,
            'model': tts_model,
            'voice': voice,
            'language_type': language_type,
            'text_length': len(text)
        })
        
    except Exception as error:
        print(f"❌ Error calling TTS API: {error}")
        
        error_message = '语音合成时发生错误，请稍后再试'
        
        # 处理特定错误类型
        if hasattr(error, 'code'):
            if error.code == 'InvalidParameter':
                error_message = '请求参数无效，请检查文本内容和音色设置'
            elif error.code == 'InvalidApiKey':
                error_message = 'API密钥无效，请检查配置'
            elif error.code == 'QuotaExceeded':
                error_message = 'TTS配额已用完，请稍后再试'
            elif error.code == 'TextTooLong':
                error_message = '文本过长，请分段处理'
            else:
                error_message = error.message or error_message
        else:
            error_message = str(error) or error_message
        
        return jsonify({
            'error': 'Failed to synthesize speech',
            'message': error_message,
            'code': getattr(error, 'code', None)
        }), 500

@app.route('/api/tts/audio/<task_id>', methods=['GET'])
def get_tts_audio(task_id):
    """获取TTS音频文件"""
    try:
        if not task_id:
            return jsonify({
                'error': 'Missing taskId',
                'message': '请提供任务ID'
            }), 400
        
        print(f"🔍 正在查询TTS任务状态: {task_id}")
        
        # 检查API Key
        api_key = os.getenv('DASHSCOPE_API_KEY')
        tts_model = os.getenv('DASHSCOPE_TTS_MODEL', 'qwen3-tts-flash')
        if not api_key:
            return jsonify({
                'error': 'TTS功能不可用',
                'message': '系统管理员需要配置DashScope API密钥才能使用语音合成功能'
            }), 500
        
        # 查询任务状态
        response = dashscope.MultiModalConversation.call(
            model=tts_model,
            api_key=api_key,
            input={'task_id': task_id}
        )
        
        if not response or not response.output:
            raise Exception('TTS状态查询失败')
        
        task_status = response.output.task_status
        
        if task_status == 'SUCCEED':
            audio_url = response.output.audio_url
            print(f"✅ TTS任务完成，音频URL: {audio_url}")
            
            return jsonify({
                'status': 'completed',
                'audio_url': audio_url,
                'task_id': task_id
            })
        elif task_status == 'FAILED':
            error_msg = response.output.message if hasattr(response.output, 'message') else '语音合成失败'
            print(f"❌ TTS任务失败: {error_msg}")
            
            return jsonify({
                'status': 'failed',
                'error': error_msg,
                'task_id': task_id
            })
        else:
            # PENDING 或 RUNNING 状态
            return jsonify({
                'status': 'processing',
                'task_id': task_id
            })
            
    except Exception as error:
        print(f"❌ Error checking TTS status: {error}")
        return jsonify({
            'error': 'Failed to check TTS status',
            'message': '查询TTS状态时发生错误'
        }), 500

@app.route('/api/ai-chat', methods=['POST'])
async def ai_chat():
    """AI对话API - 结合LLM和TTS"""
    try:
        data = request.get_json()
        
        # 获取请求参数
        message = data.get('message', '')
        voice = data.get('voice', 'Cherry')
        language_type = data.get('language_type', 'Chinese')
        include_audio = data.get('include_audio', True)
        enable_tools = data.get('enable_tools', False)  # 新增：控制是否启用工具
        conversation_id = data.get('conversation_id', 'default')
        reset_history = data.get('reset_history', False)
        history: List[dict] | None = None
        
        if not message:
            return jsonify({
                'error': 'Missing message',
                'message': '请提供对话消息'
            }), 400

        if enable_tools:
            history = get_conversation_history(conversation_id)
            if reset_history:
                history.clear()
        
        print(f"💬 正在处理AI对话请求...")
        print(f"📝 用户消息: {message[:100]}{'...' if len(message) > 100 else ''}")
        
        # 调用魔搭社区LLM生成回复
        try:
            print(f"🤖 正在调用魔搭社区LLM生成回复...")
            
            # 从环境变量获取配置            
            MODELSCOPE_BASE_URL = os.getenv('MODELSCOPE_BASE_URL', 'https://api-inference.modelscope.cn/v1')
            MODELSCOPE_API_KEY = os.getenv('MODELSCOPE_API_KEY', 'xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
            MODELSCOPE_MODEL = os.getenv('MODELSCOPE_MODEL', 'deepseek-ai/DeepSeek-V3.2-Exp')

            llm = ChatOpenAI(
                model=MODELSCOPE_MODEL,
                api_key=MODELSCOPE_API_KEY,
                base_url=MODELSCOPE_BASE_URL)
            
            # 构造对话历史（维持上下文）
            system_prompt = "你是一个专业的旅游助手，你的任务是为用户提供关于湖南旅游的专业建议和信息。请用友好、专业的语气回答用户的问题。回答要求：1. 使用纯文本格式，不要使用Markdown或其他格式；2. 回答要简洁明了，突出重点；3. 提供实用的旅游建议和信息。"

            conversation_history = [
                {
                    "role": "system",
                    "content": system_prompt
                }
            ]

            if history:
                conversation_history.extend(history)

            # 添加当前用户消息
            conversation_history.append({
                "role": "user",
                "content": message
            })
            
            # 如果启用了工具，修改系统提示词或添加工具定义
            if enable_tools:
                print("🔧 已启用工具支持 (MCP/Function Calling)")
                # 获取MCP工具
                tools = await mcp_client.get_tools()
                print(f"🔧 可用工具数量: {len(tools)}")
                print(f"🔧 工具列表: {[tool.name for tool in tools]}")
                agent = create_agent(
                    model=llm,
                    tools=tools,
                    system_prompt=system_prompt,
                    middleware=[
                        ToolErrorHandlerMiddleware()
                    ],  
                )
                 # 调用Agent获取最终回答
                response = await agent.ainvoke({
                    "messages": conversation_history
                })
                print(f"✅ LLM回复生成成功 (工具模式)")
                print(f"📋 LLM完整响应: {response}")

                # 提取最终消息
                final_message = response["messages"][-1]
                ai_response = final_message.content                

            else:
                agent = create_agent(
                    model=llm,
                    system_prompt=system_prompt,
                )

                # Run the agent
                result = agent.invoke(
                    {"messages": conversation_history}
                )
                print(f"✅ LLM回复生成成功 (无工具模式)")
                # 获取最终回答（最后一条消息）
                final_message = result["messages"][-1]
                ai_response = final_message.content

            # 如果工具模式未生成有效回复，回退到无工具模式
            if not ai_response or ai_response.strip() == "":
                agent = create_agent(
                    model=llm,
                    system_prompt=system_prompt,
                )

                # Run the agent
                result = agent.invoke(
                    {"messages": conversation_history}
                )
                print(f"✅ LLM回复生成成功 (无工具模式)")
                # 获取最终回答（最后一条消息）
                final_message = result["messages"][-1]
                ai_response = final_message.content
                                
                
        except Exception as llm_error:
            print(f"⚠️ LLM调用异常，使用默认回复: {llm_error}")
            ai_response = "湖南是一个充满魅力的旅游胜地，拥有丰富的自然风光和人文景观。我为您推荐张家界、凤凰古城、岳阳楼等经典景点，每个地方都值得细细品味。"

        # 将本轮对话写入历史（仅工具模式需要上下文）
        if history is not None:
            history.extend([
                {
                    "role": "user",
                    "content": message
                },
                {
                    "role": "assistant",
                    "content": ai_response
                }
            ])
            trim_conversation_history(history)
        
        print(f"✅ AI回复生成成功")
        print(f"📏 AI回复文本长度: {len(ai_response)} 字符")
        print(f"📝 AI回复内容: {ai_response[:200]}{'...' if len(ai_response) > 200 else ''}")
        
        result = {
            'user_message': message,
            'ai_response': ai_response,
            'voice': voice,
            'language_type': language_type
        }
        
        # 如果需要音频，调用TTS
        if include_audio and os.getenv('DASHSCOPE_API_KEY'):
            try:
                print(f"🗣️ 正在为AI回复生成语音...")
                
                # 检查文本长度，如果超过600字节则进行分段处理
                max_length = 600
                text_bytes = len(ai_response.encode('utf-8'))
                print(f"📏 文本字节长度: {text_bytes} (字符长度: {len(ai_response)})")
                
                if text_bytes > max_length:
                    print(f"⚠️ 文本字节长度超过限制 ({text_bytes} > {max_length})，正在进行分段处理...")
                    
                    # 智能分段：按句号、问号、感叹号切割，尽量保持语义完整
                    import re
                    sentences = re.split(r'[。！？]', ai_response)
                    segments = []
                    current_segment = ""
                    
                    for sentence in sentences:
                        sentence = sentence.strip()
                        if not sentence:
                            continue
                            
                        sentence_with_punct = sentence + "。"  # 默认使用句号
                        
                        # 计算当前段和新句子的字节长度
                        current_bytes = len(current_segment.encode('utf-8'))
                        sentence_bytes = len(sentence_with_punct.encode('utf-8'))
                        
                        # 如果当前段加上新句子不超过限制，则添加
                        if current_bytes + sentence_bytes <= max_length:
                            current_segment += sentence_with_punct
                        else:
                            # 如果当前段不为空，则保存
                            if current_segment.strip():
                                segments.append(current_segment.strip())
                            
                            # 如果新句子本身不超过限制，则作为新段
                            if sentence_bytes <= max_length:
                                current_segment = sentence_with_punct
                            else:
                                # 如果句子本身超过限制，则按字节强制截断
                                # 逐步截断直到字节长度符合要求
                                truncated = sentence
                                while len(truncated.encode('utf-8')) > max_length - 3:  # 留3字节给"..."
                                    truncated = truncated[:-1]
                                truncated += "..."
                                segments.append(truncated)
                                current_segment = ""
                    
                    # 添加最后一段
                    if current_segment.strip():
                        segments.append(current_segment.strip())
                    
                    # 验证每段的字节长度
                    for i, segment in enumerate(segments):
                        segment_bytes = len(segment.encode('utf-8'))
                        print(f"📊 段 {i+1}: {segment_bytes} 字节, {len(segment)} 字符")
                        if segment_bytes > max_length:
                            print(f"⚠️ 段 {i+1} 仍然超过限制，进行强制截断")
                            # 强制截断
                            while len(segment.encode('utf-8')) > max_length:
                                segment = segment[:-1]
                            segments[i] = segment
                    
                    print(f"✂️ 文本已分段，共 {len(segments)} 段")
                    
                    # 为每段生成TTS音频
                    audio_urls = []
                    tts_model = os.getenv('DASHSCOPE_TTS_MODEL', 'qwen3-tts-flash')
                    for i, segment in enumerate(segments):
                        print(f"🗣️ 正在生成第 {i+1} 段音频 (长度: {len(segment)})...")
                        
                        try:
                            tts_response = dashscope.MultiModalConversation.call(
                                model=tts_model,
                                api_key=os.getenv('DASHSCOPE_API_KEY'),
                                text=segment,
                                voice=voice,
                                language_type=language_type,
                                stream=False
                            )
                            
                            if tts_response and hasattr(tts_response, 'output') and tts_response.output:
                                if hasattr(tts_response.output, 'audio') and tts_response.output.audio:
                                    audio_info = tts_response.output.audio
                                    if hasattr(audio_info, 'url') and audio_info.url:
                                        audio_urls.append(audio_info.url)
                                        print(f"✅ 第 {i+1} 段音频生成成功: {audio_info.url}")
                                    else:
                                        print(f"❌ 第 {i+1} 段音频URL获取失败: {audio_info}")
                                else:
                                    print(f"❌ 第 {i+1} 段音频信息格式异常: {tts_response.output}")
                            else:
                                print(f"❌ 第 {i+1} 段TTS调用失败: {tts_response}")
                                
                        except Exception as segment_error:
                            print(f"❌ 第 {i+1} 段音频生成异常: {segment_error}")
                    
                    if audio_urls:
                        result['audio_urls'] = audio_urls
                        print(f"✅ 共生成 {len(audio_urls)} 段音频")
                    else:
                        result['audio_error'] = '所有分段音频生成均失败'
                else:
                    # 文本长度未超过限制，直接生成音频
                    tts_model = os.getenv('DASHSCOPE_TTS_MODEL', 'qwen3-tts-flash')
                    tts_response = dashscope.MultiModalConversation.call(
                        model=tts_model,
                        api_key=os.getenv('DASHSCOPE_API_KEY'),
                        text=ai_response,
                        voice=voice,
                        language_type=language_type,
                        stream=False
                    )
                    
                    print(f"📋 TTS响应: {tts_response}")
                    
                    if tts_response and hasattr(tts_response, 'output') and tts_response.output:
                        # 检查是否有直接的音频URL
                        if hasattr(tts_response.output, 'audio') and tts_response.output.audio:
                            audio_info = tts_response.output.audio
                            if hasattr(audio_info, 'url') and audio_info.url:
                                # 直接返回音频URL
                                result['audio_url'] = audio_info.url
                                print(f"✅ TTS音频生成成功，音频URL: {audio_info.url}")
                            elif hasattr(audio_info, 'id') and audio_info.id:
                                # 返回音频ID用于后续查询
                                result['audio_task_id'] = audio_info.id
                                print(f"✅ TTS任务创建成功 (音频ID: {audio_info.id})")
                            else:
                                print(f"❌ TTS音频信息格式异常: {audio_info}")
                                result['audio_error'] = 'TTS音频信息格式异常'
                        elif hasattr(tts_response.output, 'task_id'):
                            # 兼容任务ID格式
                            result['audio_task_id'] = tts_response.output.task_id
                            print(f"✅ TTS任务创建成功 (任务ID: {tts_response.output.task_id})")
                        else:
                            print(f"❌ TTS响应格式异常: {tts_response.output}")
                            result['audio_error'] = 'TTS API响应格式异常'
                    else:
                        print(f"❌ TTS响应格式异常: {tts_response}")
                        result['audio_error'] = 'TTS API响应格式异常'
                
            except Exception as tts_error:
                print(f'⚠️ TTS生成失败，但文本回复正常: {tts_error}')
                result['audio_error'] = str(tts_error)
        elif include_audio and not os.getenv('DASHSCOPE_API_KEY'):
            result['audio_error'] = 'TTS功能不可用，未配置DashScope API密钥'
        
        return jsonify(result)
        
    except Exception as error:
        print(f"❌ Error in AI chat: {error}")
        return jsonify({
            'error': 'Failed to process AI chat',
            'message': '处理AI对话时发生错误，请稍后再试'
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))  # 默认端口5000
    print(f"🚀 Flask TTS Server is running on port {port}")
    print(f"📍 TTS API: http://localhost:{port}")
    
    app.run(host='0.0.0.0', port=port, debug=True)
