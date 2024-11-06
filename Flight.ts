import Order from "./Order";

import logger from "./logger";

// Zips can fly a total roundtrip distance (m)
const ZIP_MAX_CUMULATIVE_RANGE_M = 160 * 1000; // 160 km -> meters

export default class Flight {
  launchTime: number;
  totalDistance: number;
  orders: Order[];
  estimatedReturnBatteryPercentage: number;
  flightPath: string;

  constructor(launchTime: number, orders: Order[], totalDistance: number) {
    this.launchTime = launchTime;
    this.orders = orders;
    this.estimatedReturnBatteryPercentage =
      100 - (totalDistance / ZIP_MAX_CUMULATIVE_RANGE_M) * 100;
    this.flightPath = this.getFlightPath();
    this.totalDistance = totalDistance;
  }

  getFlightPath(): string {
    return this.orders
      .map((order) => `${order.hospital.name} (${order.priority})`)
      .join(" -> ")
      .concat(" -> Nest");
  }

  getPriorityPath(): string {
    return this.orders
      .map((order) => order.priority)
      .join(" -> ")
      .concat(" -> Nest");
  }

  toString() {
    return `<Flight @ ${
      this.launchTime
    } | Path: ${this.getFlightPath()} | Total Distance: ${
      this.totalDistance
    }m | Return Battery: ${this.estimatedReturnBatteryPercentage.toFixed(2)}%>`;
  }
}
