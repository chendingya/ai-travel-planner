pipeline {
    agent any
    
    environment {
        // 定义环境变量
        BACKEND_PORT = '3001'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '📥 开始检出代码...'
                checkout scm
                echo '✅ 代码检出完成'
            }
        }
        
        stage('Setup Backend Environment') {
            steps {
                echo '🔧 配置后端环境...'
                script {
                    sh '''
                        cd backend
                        if [ ! -f .env ]; then
                            cp .env.example .env
                            echo "⚠️  请配置 backend/.env 中的环境变量"
                        fi
                    '''
                    
                    // 从 Jenkins 凭据中获取后端环境变量
                    withCredentials([
                        string(credentialsId: 'DASHSCOPE_API_KEY', variable: 'API_KEY'),
                        string(credentialsId: 'SUPABASE_URL', variable: 'SUPABASE_URL'),
                        string(credentialsId: 'SUPABASE_SERVICE_KEY', variable: 'SUPABASE_SERVICE_KEY')
                    ]) {
                        sh '''
                            cd backend
                            sed -i "s/your_dashscope_api_key_here/$API_KEY/g" .env
                            sed -i "s|your_supabase_url_here|$SUPABASE_URL|g" .env
                            sed -i "s/your_supabase_service_role_key_here/$SUPABASE_SERVICE_KEY/g" .env
                        '''
                    }
                }
                echo '✅ 后端环境配置完成'
            }
        }
        
        stage('Setup Frontend Environment') {
            steps {
                echo '🔧 配置前端环境...'
                script {
                    sh '''
                        cd frontend
                        if [ ! -f .env ]; then
                            cp .env.example .env
                            echo "⚠️  请配置 frontend/.env 中的环境变量"
                        fi
                    '''
                    
                    // 从 Jenkins 凭据中获取前端环境变量
                    withCredentials([
                        string(credentialsId: 'VITE_AMAP_KEY', variable: 'AMAP_KEY'),
                        string(credentialsId: 'VITE_AMAP_SECURITY_CODE', variable: 'AMAP_SECURITY_CODE'),
                        string(credentialsId: 'SUPABASE_URL', variable: 'SUPABASE_URL'),
                        string(credentialsId: 'SUPABASE_ANON_KEY', variable: 'SUPABASE_ANON_KEY')
                    ]) {
                        sh '''
                            cd frontend
                            sed -i "s/your_amap_key_here/$AMAP_KEY/g" .env
                            sed -i "s/your_security_code_here/$AMAP_SECURITY_CODE/g" .env
                            sed -i "s|your_supabase_url_here|$SUPABASE_URL|g" .env
                            sed -i "s/your_supabase_anon_key_here/$SUPABASE_ANON_KEY/g" .env
                        '''
                    }
                }
                echo '✅ 前端环境配置完成'
            }
        }
        
        stage('Install Backend Dependencies') {
            steps {
                echo '📦 安装后端依赖...'
                sh '''
                    cd backend
                    npm install --production
                '''
                echo '✅ 后端依赖安装完成'
            }
        }
        
        stage('Install Frontend Dependencies') {
            steps {
                echo '📦 安装前端依赖...'
                sh '''
                    cd frontend
                    npm install
                '''
                echo '✅ 前端依赖安装完成'
            }
        }
        
        stage('Build Frontend') {
            steps {
                echo '🔨 构建前端项目...'
                sh '''
                    cd frontend
                    npm run build
                '''
                echo '✅ 前端构建完成'
            }
        }
        
        stage('Copy Frontend to Backend') {
            steps {
                echo '将前端构建产物复制到后端...'
                sh '''
                    rm -rf backend/public/*
                    cp -r frontend/dist/* backend/public/
                '''
                echo '✅ 复制完成'
            }
        }
        
        stage('Stop Previous Application') {
            steps {
                echo '⏹️ 停止之前运行的应用...'
                script {
                    sh '''
                        # 查找并停止之前运行的进程
                        PID=$(lsof -t -i:${BACKEND_PORT})
                        if [ ! -z "$PID" ]; then
                            echo "停止进程 PID: $PID"
                            kill $PID
                            sleep 5
                        else
                            echo "没有找到在端口 ${BACKEND_PORT} 上运行的应用"
                        fi
                    ''' || echo "没有正在运行的应用需要停止"
                }
                echo '✅ 旧应用已停止'
            }
        }
        
        stage('Run Application') {
            steps {
                echo '🚀 启动应用程序...'
                sh '''
                    cd backend
                    npm start &
                    echo $! > app.pid
                '''
                echo '✅ 应用程序已在后台启动，PID 保存在 app.pid'
            }
        }
        
        stage('Health Check') {
            steps {
                echo '🩺 检查应用健康状态...'
                script {
                    // 等待应用启动
                    sleep 10
                    
                    // 检查应用是否正常运行
                    timeout(time: 1, unit: 'MINUTES') {
                        waitUntil {
                            script {
                                def healthCheck = sh(
                                    script: "curl -s http://localhost:${BACKEND_PORT}/health | grep -q 'ok' && echo 'pass' || echo 'fail'",
                                    returnStdout: true
                                ).trim()
                                return healthCheck == 'pass'
                            }
                        }
                    }
                }
                echo '✅ 应用健康检查通过'
            }
        }
    }
    
    post {
        success {
            echo '🎉 部署成功完成！应用已运行在端口 ${BACKEND_PORT}'
            echo "应用查看地址: http://<your-server-ip>:${BACKEND_PORT}"
        }
        failure {
            echo '❌ 部署失败，请检查日志'
        }
        cleanup {
            echo '🧹 清理工作空间...'
        }
    }
}