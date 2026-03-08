/**
 * 知识库爬虫配置
 * 数据来源：Wikivoyage（CC-BY-SA 3.0 协议）
 */

// 目标城市列表
const CITIES = [
  // 华北
  '北京', '天津', '大同', '平遥', '承德', '秦皇岛', '保定',
  // 华东
  '上海', '杭州', '苏州', '南京', '黄山', '厦门', '泉州', '扬州',
  '宁波', '舟山', '乌镇', '西塘', '周庄', '婺源', '景德镇', '无锡',
  '温州', '福州', '莆田', '绍兴',
  // 华南
  '广州', '深圳', '桂林', '阳朔', '三亚', '珠海',
  '海口', '北海', '柳州', '潮州', '肇庆', '梅州',
  // 西南
  '成都', '重庆', '丽江', '大理', '昆明', '拉萨', '西双版纳',
  '贵阳', '遵义', '香格里拉', '腾冲', '稻城', '泸沽湖', '西昌',
  // 西北
  '西安', '敦煌', '张掖', '乌鲁木齐', '喀什',
  '银川', '西宁', '兰州', '嘉峪关',
  // 华中
  '武汉', '长沙', '张家界', '凤凰',
  '郑州', '洛阳', '开封', '岳阳', '宜昌',
  // 东北
  '哈尔滨', '长春', '沈阳', '大连', '延吉', '牡丹江',
];

/**
 * Wikivoyage 分节名称 → 知识类型映射
 * 中文 Wikivoyage 常见分节
 */
const SECTION_TYPES = {
  // 城市概况
  '了解': 'guide',
  '认识': 'guide',
  '背景': 'guide',
  '概况': 'guide',
  '简介': 'guide',
  '历史': 'guide',
  '地理': 'guide',
  '气候': 'guide',
  '文化': 'guide',
  // 交通
  '前往': 'transport',
  '抵达': 'transport',
  '交通': 'transport',
  '市内交通': 'transport',
  '出行': 'transport',
  '离开': 'transport',
  // 景点
  '游览': 'attraction',
  '景点': 'attraction',
  '参观': 'attraction',
  '观光': 'attraction',
  '名胜': 'attraction',
  '地标': 'attraction',
  '博物馆': 'attraction',
  '古迹': 'attraction',
  '自然': 'attraction',
  // 活动
  '体验': 'activity',
  '活动': 'activity',
  '户外': 'activity',
  '运动': 'activity',
  '娱乐': 'activity',
  '夜生活': 'activity',
  // 购物
  '购物': 'shopping',
  '买': 'shopping',
  '市场': 'shopping',
  // 美食
  '饮食': 'food',
  '吃': 'food',
  '餐饮': 'food',
  '美食': 'food',
  '小吃': 'food',
  '特产': 'food',
  // 住宿
  '住宿': 'accommodation',
  '住': 'accommodation',
  '酒店': 'accommodation',
  '民宿': 'accommodation',
  // 注意事项
  '注意': 'notice',
  '安全': 'notice',
  '须知': 'notice',
  '提示': 'notice',
  '警告': 'notice',
  // 实用信息
  '保持联系': 'contact',
  '联系': 'contact',
  '实用': 'contact',
  '信息': 'contact',
  '语言': 'contact',
  '货币': 'contact',
  '其他': 'contact',
  // 分区/地段（Wikivoyage 常用 "区" 作为城市分区章节）
  '区': 'guide',
  '景区': 'guide',
  '周边': 'guide',
  '附近': 'guide',
  // 旅行活动（周游= Getting around）
  '周游': 'transport',
  '到达': 'transport',
  '出发': 'transport',
  // 节日/节庆
  '节日': 'activity',
  '节庆': 'activity',
  // 签证/健康
  '签证': 'notice',
  '健康': 'notice',
  '尊重': 'notice',
};

// 爬虫行为配置
const CRAWL_CONFIG = {
  /** 每次请求之间的最小间隔（毫秒），遵守 Wikimedia API 政策 */
  delayMs: 1500,
  /** HTTP 请求超时 */
  timeoutMs: 20000,
  /** 最大重试次数 */
  maxRetries: 3,
  /** 标识爬虫身份，符合 Wikimedia API 规范 */
  userAgent: 'AI-TravelPlanner-KnowledgeBot/1.0 (Educational RAG project; Node.js)',
  /** 输出目录（相对于 backend/ 目录） */
  outputDir: 'data/knowledge',
  /** Wikivoyage Action API 地址 */
  wikivoyageApiBase: 'https://zh.wikivoyage.org/w/api.php',
};

/**
 * RAG 分块参数说明
 * ─────────────────────────────────────────────────────
 * MAX_CHUNK_LENGTH: 单个 chunk 的最大字符数。
 *   - 太大 → 召回时噪音多，LLM 上下文浪费
 *   - 太小 → 语义不完整，丢失上下文
 *   - 800 中文字符 ≈ 500~600 token，是实践中较优的区间
 *
 * CHUNK_OVERLAP: 分块间的重叠字符数。
 *   - 防止句子在 chunk 边界被截断时丢失语义
 *   - 120 字符（约 1~2 句）在中文文本中效果较好
 */
const MAX_CHUNK_LENGTH = 800;
const CHUNK_OVERLAP = 120;

module.exports = { CITIES, SECTION_TYPES, CRAWL_CONFIG, MAX_CHUNK_LENGTH, CHUNK_OVERLAP };
