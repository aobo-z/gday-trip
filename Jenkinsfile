pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timestamps()
    }

    environment {
        PATH = "/opt/homebrew/bin:${env.PATH}"
        CI = "true"
    }

    stages {
        stage('Backend') {
            steps {
                dir('trip-planner-backend') {
                    sh 'chmod +x mvnw'
                    sh './mvnw -B clean verify'
                }
            }
            post {
                always {
                    junit allowEmptyResults: true,
                        testResults: 'trip-planner-backend/target/surefire-reports/*.xml'
                }
                success {
                    archiveArtifacts artifacts: 'trip-planner-backend/target/*.jar',
                        fingerprint: true
                }
            }
        }

        stage('Frontend') {
            steps {
                dir('trip-planner-frontend') {
                    sh 'npm ci'
                    sh 'npm run lint'
                    sh 'npm run build'
                }
            }
            post {
                success {
                    archiveArtifacts artifacts: 'trip-planner-frontend/dist/**',
                        fingerprint: true
                }
            }
        }
    }

    post {
        always {
            cleanWs deleteDirs: true, notFailBuild: true
        }
    }
}
