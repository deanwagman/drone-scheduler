import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors, json } = format;

// Define custom log format
const customFormat = printf(({ level, message }) => {
  return `[${level}]: ${message}`;
});

// Initialize Winston logger
const logger = createLogger({
  level: "info", // Default log level
  format: combine(
    colorize(), // Adds color to the log based on level
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }), // Capture stack traces
    customFormat
  ),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp(), customFormat),
    }), // Log to console
    new transports.File({ filename: "logs/error.log", level: "error" }), // Log errors to a file
    new transports.File({ filename: "logs/combined.log" }), // Log all levels to a file
  ],
  exceptionHandlers: [new transports.File({ filename: "logs/exceptions.log" })],
  rejectionHandlers: [new transports.File({ filename: "logs/rejections.log" })],
});

export default logger;
