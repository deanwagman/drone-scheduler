import { readFileSync } from "fs";

import Hospital from "./Hospital";
import Order from "./Order";
import ZipScheduler from "./FlightScheduler";

import logger from "./logger";

// Each Nest has this many Zips
const NUM_ZIPS = 10;

// Each Zip can carry between 1 and this many packages per flight
// Note: a Zip can deliver more than 1 package per stop
const MAX_PACKAGES_PER_ZIP = 3;

// Zips fly a constant groundspeed (m/s)
const ZIP_SPEED_MPS = 30;

// Zips can fly a total roundtrip distance (m)
const ZIP_MAX_CUMULATIVE_RANGE_M = 160 * 1000; // 160 km -> meters

/**
 * A simulation runner that can playback order CSVs as if the day were
 * progressing.
 */
export default class Runner {
  hospitals: Record<string, Hospital>;
  orders: Order[];
  totalOrderCount: number = 0;
  scheduler: ZipScheduler;

  constructor(hospitalsPath: string, ordersPath: string) {
    this.hospitals = Hospital.loadFromCsv(readFileSync(hospitalsPath, "utf8"));
    this.orders = Order.loadFromCsv(
      readFileSync(ordersPath, "utf8"),
      this.hospitals
    );
    this.totalOrderCount = this.orders.length;

    this.scheduler = new ZipScheduler(
      this.hospitals,
      NUM_ZIPS,
      MAX_PACKAGES_PER_ZIP,
      ZIP_SPEED_MPS,
      ZIP_MAX_CUMULATIVE_RANGE_M
    );
  }

  run() {
    const secondsPerDay = 24 * 60 * 60;
    for (
      let secondsSinceMidnight =
        this.orders.length > 0 ? this.orders[0].time - 1 : 0;
      secondsSinceMidnight < secondsPerDay;
      secondsSinceMidnight++
    ) {
      this._queuePendingOrders(secondsSinceMidnight);

      if (secondsSinceMidnight % 60 === 0) {
        this._updateLaunchFlights(secondsSinceMidnight);
      }
    }

    logger.info("=== End of day ===");
    logger.info(`Total orders: ${this.scheduler.completeOrderCount}`);
    logger.info(
      `${this.scheduler.unfulfilledOrdersCount} unfulfilled orders at the end of the day\n`
    );

    if (this.scheduler.unfulfilledOrdersCount > 0) {
      for (const order of this.scheduler.getUnfulfilledOrders()) {
        logger.info(
          `Unfulfilled order at the end of the day: ${order.hospital.name} (${order.priority}), ${order.time}`
        );
      }
    }
  }

  private _queuePendingOrders(secondsSinceMidnight: number) {
    while (this.orders.length && this.orders[0].time === secondsSinceMidnight) {
      const order: Order = this.orders.shift()!;

      this.scheduler.queueOrder(order);
    }
  }

  private _updateLaunchFlights(secondsSinceMidnight: number) {
    const flights = this.scheduler.launchFlights(secondsSinceMidnight);
    if (flights.length) {
      logger.info(
        `===> [${secondsSinceMidnight}] ${flights.length} flights launched`
      );
      for (const flight of flights) {
        logger.info(
          `     [${secondsSinceMidnight}] ${
            flight.orders.length
          } orders dispatched to ${flight.getFlightPath()}`
        );
      }
    }
  }
}
