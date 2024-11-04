import { readFileSync } from "fs";

// Each Nest has this many Zips
const NUM_ZIPS = 10;

// Each Zip can carry between 1 and this many packages per flight
// Note: a Zip can deliver more than 1 package per stop
const MAX_PACKAGES_PER_ZIP = 3;

// Zips fly a constant groundspeed (m/s)
const ZIP_SPEED_MPS = 30;

// Zips can fly a total roundtrip distance (m)
const ZIP_MAX_CUMULATIVE_RANGE_M = 160 * 1000; // 160 km -> meters

// The two acceptable priorities
type Priority = "Emergency" | "Resupply";

// You shouldn't need to modify this class
class Hospital {
  name: string;
  northM: number;
  eastM: number;

  constructor(name: string, northM: number, eastM: number) {
    this.name = name;
    this.northM = northM;
    this.eastM = eastM;
  }

  /**
   * Reads and processes a CSV file object that conforms to the hospital.csv schema defined in README.md.
   * @param {string} file CSV file as a string to read into a dict.
   * @returns {Record<string, Hospital>} Mapping of ospitals and their coordinates.
   */
  static loadFromCsv(file: string): Record<string, Hospital> {
    const hospitals: Record<string, Hospital> = {};
    const lines = file.split("\n");
    lines.forEach((line) => {
      const [name, northM, eastM] = line
        .split(",")
        .map((value) => value.trim());
      hospitals[name] = new Hospital(
        name,
        parseInt(northM, 10),
        parseInt(eastM, 10)
      );
    });
    return hospitals;
  }
}

// You shouldn't need to modify this class
class Order {
  time: number;
  hospital: Hospital;
  priority: Priority;

  constructor(time: number, hospital: Hospital, priority: Priority) {
    this.time = time;
    this.hospital = hospital;
    this.priority = priority;
  }

  /**
   * Reads and processes a CSV file object that conforms to the orders.csv schema defined in README.md.
   * Ok to assume the orders are sorted.
   * @param {string} file CSV file as a string to read into a dict.
   * @param {Record<string, Hospital>} hospitals mapping of hospital name to Hospital objects
   * @returns {Order[]} List of Order objects.
   */
  static loadFromCsv(
    file: string,
    hospitals: Record<string, Hospital>
  ): Order[] {
    const lines = file.split("\n");
    const orders: Order[] = lines.map((line) => {
      const [time, hospitalName, priority] = line
        .split(",")
        .map((value) => value.trim());
      return new Order(
        parseInt(time, 10),
        hospitals[hospitalName],
        priority as Priority
      );
    });
    return orders;
  }
}

// Feel free to exend as needed
class Flight {
  launchTime: number;
  orders: Order[];

  constructor(launchTime: number, orders: Order[]) {
    this.launchTime = launchTime;
    this.orders = orders;
  }

  toString() {
    const ordersStr = this.orders
      .map((order) => order.hospital.name)
      .join("->");
    return `<Flight @ ${this.launchTime} to ${ordersStr}>`;
  }
}

class ZipScheduler {
  hospitals: Record<string, Hospital>;
  numZips: number;
  maxPackagesPerZip: number;
  zipSpeedMps: number;
  zipMaxCumulativeRangeM: number;

  private _unfulfilledOrders: Order[] = [];

  constructor(
    hospitals: Record<string, Hospital>,
    numZips: number,
    maxPackagesPerZip: number,
    zipSpeedMps: number,
    zipMaxCumulativeRangeM: number
  ) {
    this.hospitals = hospitals;
    this.numZips = numZips;
    this.maxPackagesPerZip = maxPackagesPerZip;
    this.zipSpeedMps = zipSpeedMps;
    this.zipMaxCumulativeRangeM = zipMaxCumulativeRangeM;

    // Track which orders haven't been launched yet
    this._unfulfilledOrders = [];
  }

  get unfulfilledOrders() {
    return this._unfulfilledOrders;
  }

  /**
   * Add a new order to our queue.
   * Note: called every time a new order arrives.
   * @param {Order} order the order just placed.
   */
  queueOrder(order: Order): void {
    // If this is an emergency, we should prioritize it as right behind the last emergency
    const isEmergency = order.priority === "Emergency";

    if (isEmergency) {
      console.log({ isEmergency });
      const lastEmergencyIndex = this._unfulfilledOrders.findIndex(
        (o) => o.priority === "Emergency"
      );
      if (lastEmergencyIndex !== -1) {
        this._unfulfilledOrders.splice(lastEmergencyIndex, 0, order);
        return;
      }
    }

    this._unfulfilledOrders.push(order);
  }

  /**
   * Determines which flights should be launched right now.
   * Each flight has an ordered list of Orders to serve.
   * Note: will be called periodically (approximately once a minute).
   * @param {number} currentTime Seconds since midnight.
   * @returns {Flight[]} List of Flight objects that launch at this time.
   */
  launchFlights(currentTime: number): Flight[] {
    // TODO: implement me!
    // You should remove any orders from `this._unfilfilledOrders` as you go
    return [];
  }
}

/**
 * A simulation runner that can playback order CSVs as if the day were
 * progressing.
 */
class Runner {
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

  /**
   * Runs the simulator.
   * This assumes any orders not fulfilled by the end of the day are failed.
   * Note:
   *     This is a barebones implementation that should help get you
   *     started. You probably want to expand the runner's capabilities.
   */
  run() {
    // Simulate time going from the first order time, until the end of the day,
    // in 1 minute increments
    const secondsPerDay = 24 * 60 * 60;
    for (
      let secondsSinceMidnight = this.orders[0].time - 1;
      secondsSinceMidnight < secondsPerDay;
      secondsSinceMidnight++
    ) {
      // Find and queue pending orders.
      this._queuePendingOrders(secondsSinceMidnight);

      if (secondsSinceMidnight % 60 === 0) {
        // Once a minute, poke the flight launcher
        this._updateLaunchFlights(secondsSinceMidnight);
      }
    }
    // These orders were not launched by midnight
    console.log(
      `${this.scheduler.unfulfilledOrders.length} unfulfilled orders at the end of the day`
    );
  }

  /**
   * Grab an order fron the queue and queue it.
   * @param {number} secondsSinceMidnight Seconds since midnight.
   */
  private _queuePendingOrders(secondsSinceMidnight: number) {
    while (this.orders.length && this.orders[0].time === secondsSinceMidnight) {
      // Find any orders that were placed during this second and tell
      // our scheduler about them
      const order: Order = this.orders.shift()!;
      console.log(
        `[${secondsSinceMidnight}] ${order.priority} order received to ${order.hospital.name}`
      );
      this.scheduler.queueOrder(order);
    }
  }

  /**
   * Schedules which flights should launch now.
   * @param {number} secondsSinceMidnight Seconds since midnight.
   */
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

/**
 * Usage:
 * > npm install
 * > npm run simulator
 *
 * Runs the provided CSVs
 * Feel free to edit this if you'd like
 */
const hospitalsPath = "../inputs/hospitals.csv";
const ordersPath = "../inputs/orders.csv";
const runner = new Runner(hospitalsPath, ordersPath);
runner.run();
