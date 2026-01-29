import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

// Níveis: error, warn, info, debug
const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      const msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      return stack ? `${msg}\n${stack}` : msg;
    })
  ),
  transports: [
    // Console (sempre ativo)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
  ],
});

// Em produção, adiciona rotação de arquivos
if (isProduction) {
  const DailyRotateFile = (await import("winston-daily-rotate-file")).default;

  // Logs de erro separados
  logger.add(
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "7d", // mantém 7 dias
    })
  );

  // Logs gerais
  logger.add(
    new DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "50m",
      maxFiles: "3d", // mantém 3 dias
    })
  );
}

export default logger;
