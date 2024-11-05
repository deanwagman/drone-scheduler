import { readFileSync } from "fs";

import Hospital from "./Hospital";
import Order from "./Order";
import ZipScheduler from "./FlightScheduler";

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
  scheduler: ZipScheduler;

  constructor(hospitalsPath: string, ordersPath: string) {
    this.hospitals = Hospital.loadFromCsv(readFileSync(hospitalsPath, "utf8"));
    this.orders = Order.loadFromCsv(
      readFileSync(ordersPath, "utf8"),
      this.hospitals
    );

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
    console.log(
      `${this.scheduler.unfulfilledOrders.length} unfulfilled orders at the end of the day`
    );

    if (this.scheduler.unfulfilledOrders.length > 0) {
      console.log("Unfulfilled orders:");
      for (const order of this.scheduler.unfulfilledOrders) {
        console.log(
          `Order at ${order.time} to ${order.hospital.name} with priority ${order.priority}`
        );
      }
    }
  }

  private _queuePendingOrders(secondsSinceMidnight: number) {
    while (this.orders.length && this.orders[0].time === secondsSinceMidnight) {
      const order: Order = this.orders.shift()!;
      console.log(
        `[${secondsSinceMidnight}] ${order.priority} order received to ${order.hospital.name}`
      );
      this.scheduler.queueOrder(order);
    }
  }

  private _updateLaunchFlights(secondsSinceMidnight: number) {
    const flights = this.scheduler.launchFlights(secondsSinceMidnight);
    if (flights.length) {
      console.log(`[${secondsSinceMidnight}] Scheduling flights:`);
      for (const flight of flights) {
        console.log(flight);
      }
    }
  }
}
