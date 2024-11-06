import Runner from "./Runner";

/**
 * Usage:
 * > npm install
 * > npm run simulator
 */
const hospitalsPath = "../inputs/hospitals.csv";
const ordersPath = "../inputs/orders.csv";
const runner = new Runner(hospitalsPath, ordersPath);
runner.run();
