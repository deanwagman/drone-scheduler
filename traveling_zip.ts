import { readFileSync } from "fs";

// Each Nest has this many Zips
const NUM_ZIPS = 10;

// Reserve this many Zips for emergencies
const RESERVED_EMERGENCY_ZIPS = 5;

// Each Zip can carry between 1 and this many packages per flight
// Note: a Zip can deliver more than 1 package per stop
const MAX_PACKAGES_PER_ZIP = 3;

// Zips fly a constant groundspeed (m/s)
const ZIP_SPEED_MPS = 30;

// Zips can fly a total roundtrip distance (m)
const ZIP_MAX_CUMULATIVE_RANGE_M = 160 * 1000; // 160 km -> meters

// The two acceptable priorities
type Priority = "Emergency" | "Resupply";

const PRIORITY_ORDER: Priority[] = ["Emergency", "Resupply"];

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
   * @returns {Record<string, Hospital>} Mapping of hospitals and their coordinates.
   */
  static loadFromCsv(file: string): Record<string, Hospital> {
    const hospitals: Record<string, Hospital> = {};
    const lines = file.split("\n");
    lines.forEach((line) => {
      if (line.trim() === "") return; // Skip empty lines
      const [name, northM, eastM] = line
        .split(",")
        .map((value) => value.trim());
      if (!name || isNaN(parseInt(northM, 10)) || isNaN(parseInt(eastM, 10)))
        return; // Skip invalid rows
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
    const orders: Order[] = lines
      .map((line) => {
        if (line.trim() === "") return null; // Skip empty lines
        const [time, hospitalName, priority] = line
          .split(",")
          .map((value) => value.trim());
        if (!time || !hospitalName || !priority || !hospitals[hospitalName])
          return null; // Skip invalid rows
        return new Order(
          parseInt(time, 10),
          hospitals[hospitalName],
          priority as Priority
        );
      })
      .filter((order) => order !== null) as Order[];
    return orders;
  }
}

class Flight {
  launchTime: number;
  orders: Order[];
  estimatedReturnBatteryPercentage: number;
  flightPath: string;

  constructor(launchTime: number, orders: Order[], totalDistance: number) {
    this.launchTime = launchTime;
    this.orders = orders;
    this.estimatedReturnBatteryPercentage =
      100 - (totalDistance / ZIP_MAX_CUMULATIVE_RANGE_M) * 100;
    this.flightPath = this.getFlightPath();
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
    return `<Flight @ ${this.launchTime} to ${this.getFlightPath()}>`;
  }
}

class ZipScheduler {
  hospitals: Record<string, Hospital>;
  numZips: number;
  maxPackagesPerZip: number;
  zipSpeedMps: number;
  zipMaxCumulativeRangeM: number;

  private _unfulfilledOrders: Order[] = [];
  private activeFlights: { returnTime: number; flight: Flight }[] = [];

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
  }

  get unfulfilledOrders() {
    return this._unfulfilledOrders;
  }

  /**
   * Calculates the straight-line distance between two points.
   */
  calculateDistance(
    pointA: { northM: number; eastM: number },
    pointB: { northM: number; eastM: number }
  ): number {
    const deltaX = pointB.northM - pointA.northM;
    const deltaY = pointB.eastM - pointA.eastM;
    return Math.sqrt(deltaX ** 2 + deltaY ** 2);
  }

  /**
   * Adds a new order to the queue, maintaining priority order.
   */
  queueOrder(order: Order): void {
    this._unfulfilledOrders.push(order);
    this._unfulfilledOrders.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.time - b.time;
      }
      return (
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      );
    });

    console.log(
      `Order queued at ${order.time} to ${order.hospital.name} with priority ${
        order.priority
      }. Total unfulfilled orders: ${
        this._unfulfilledOrders.length
      }, Emergency: ${
        this._unfulfilledOrders.filter(
          (order) => order.priority === "Emergency"
        ).length
      }, Resupply: ${
        this._unfulfilledOrders.filter((order) => order.priority === "Resupply")
          .length
      }`
    );
  }

  /**
   * Releases Zips that have returned by the current time.
   */
  releaseReturningZips(currentTime: number): void {
    const beforeRelease = this.activeFlights.length;
    this.activeFlights = this.activeFlights.filter((flight) => {
      if (flight.returnTime <= currentTime) {
        console.log(
          `<= Zip returned at ${currentTime} from flight launched at ${flight.flight.launchTime}`
        );
        return false;
      }
      return true;
    });
    const afterRelease = this.activeFlights.length;
    if (beforeRelease !== afterRelease) {
      console.log(
        `Released ${beforeRelease - afterRelease} Zip(s) at ${currentTime}`
      );
    }
  }

  /**
   * Calculates the return time based on total distance and Zip speed.
   */
  calculateReturnTime(launchTime: number, totalDistance: number): number {
    return launchTime + Math.ceil(totalDistance / this.zipSpeedMps);
  }

  /**
   * Launches flights based on current time and available Zips.
   */
  launchFlights(currentTime: number): Flight[] {
    this.releaseReturningZips(currentTime);
    const flights: Flight[] = [];
    let availableZips = this.numZips - this.activeFlights.length;

    if (this._unfulfilledOrders.length === 0) return flights;

    if (availableZips <= 0) {
      console.log(
        `No available Zips at ${currentTime}. Waiting for Zips to return.`
      );
      return flights;
    }

    console.log(`Available Zips at ${currentTime}: ${availableZips}`);

    while (this._unfulfilledOrders.length > 0) {
      // Only launch resupply flights if there are more than RESERVED_EMERGENCY_ZIPS available
      const isEmergencyOrder =
        this._unfulfilledOrders[0].priority === "Emergency";
      if (!isEmergencyOrder && availableZips <= RESERVED_EMERGENCY_ZIPS) {
        console.log(
          "Delaying resupply flight due to insufficient available Zips"
        );
        break;
      }

      const { flightOrders, totalDistance } = this.planFlight(
        this._unfulfilledOrders
      );

      if (flightOrders.length > 0) {
        const flight = new Flight(currentTime, flightOrders, totalDistance);
        flights.push(flight);

        const returnTime = this.calculateReturnTime(currentTime, totalDistance);
        this.activeFlights.push({ returnTime, flight });

        this._unfulfilledOrders = this._unfulfilledOrders.filter(
          (order) => !flightOrders.includes(order) // Remove fulfilled orders
        );
        availableZips -= 1;

        console.log(`Scheduled flight at ${currentTime}: ${flight}`);
      } else {
        break; // No feasible flight can be planned
      }
    }

    return flights;
  }

  /**
   * Plans a single flight by selecting appropriate orders.
   */
  private planFlight(orders: Order[]): {
    flightOrders: Order[];
    totalDistance: number;
  } {
    let currentLocation = { northM: 0, eastM: 0 }; // Start at the Nest
    let flightOrders: Order[] = [];
    let totalDistance = 0;

    // Prioritize Emergency orders first
    const sortedOrders = orders.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.time - b.time;
      }
      return (
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      );
    });

    for (const order of sortedOrders) {
      if (flightOrders.length >= this.maxPackagesPerZip) break;

      const distanceToOrder = this.calculateDistance(
        currentLocation,
        order.hospital
      );
      const distanceBackToNest = this.calculateDistance(order.hospital, {
        northM: 0,
        eastM: 0,
      });
      const newTotalDistance =
        totalDistance + distanceToOrder + distanceBackToNest;

      if (newTotalDistance > this.zipMaxCumulativeRangeM) continue;

      // Add order to flight
      flightOrders.push(order);
      totalDistance += distanceToOrder;
      currentLocation = order.hospital;
    }

    // Add distance back to the Nest
    totalDistance += this.calculateDistance(currentLocation, {
      northM: 0,
      eastM: 0,
    });

    return { flightOrders, totalDistance };
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

/**
 * Usage:
 * > npm install
 * > npm run simulator
 */
const hospitalsPath = "../inputs/hospitals.csv";
const ordersPath = "../inputs/orders.csv";
const runner = new Runner(hospitalsPath, ordersPath);
runner.run();
