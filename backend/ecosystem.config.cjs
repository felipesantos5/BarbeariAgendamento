module.exports = {
  apps: [
    {
      name: 'barberia-api',
      script: './src/app.js',

      // Configuração de instâncias
      // Usando 2 instâncias ao invés de 'max' para melhor controle de memória
      // Em um ambiente com 4GB total e várias aplicações, 2 instâncias oferecem
      // redundância sem consumir muita RAM adicional
      instances: 2,
      exec_mode: 'cluster',

      // Gerenciamento agressivo de memória
      // Reinicia a instância se ultrapassar 500MB (evita OOM Killer do sistema)
      max_memory_restart: '500M',

      // Configuração de reinicialização
      autorestart: true,
      watch: false,

      // Exponential backoff para evitar loops de reinicialização que fritam a CPU
      // Começa com 100ms e dobra a cada tentativa até o máximo de 10s
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s', // Considera como crash se morrer antes de 10s

      // Configuração de ambiente
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },

      // Logs otimizados (PM2 já faz rotação automática)
      error_file: '/dev/null', // Docker já captura logs via stdout/stderr
      out_file: '/dev/null',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Kill timeout
      // Dá 5s para a aplicação fazer graceful shutdown
      kill_timeout: 5000,

      // Configurações adicionais de estabilidade
      listen_timeout: 10000, // Aguarda 10s para a app estar pronta
      shutdown_with_message: true,

      // Node.js args para otimizar memória
      node_args: [
        '--max-old-space-size=400', // Limita heap do V8 a 400MB (deixa margem para o PM2)
        '--max-semi-space-size=4',  // Reduz espaço para objetos jovens
        '--optimize-for-size'        // Otimiza para uso de memória ao invés de velocidade
      ]
    }
  ]
};
