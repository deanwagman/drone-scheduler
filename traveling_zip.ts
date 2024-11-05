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
  ageOfOldestOrder: number;
  flightPathDescription: string;
  packagePriorityDescription: string;
  estimatedReturnBatteryPercentage: number;

  constructor(launchTime: number, orders: Order[], totalDistance: number) {
    this.launchTime = launchTime;
    this.orders = orders;
    this.ageOfOldestOrder = orders.reduce(
      (maxAge, order) => Math.max(maxAge, launchTime - order.time),
      0
    );
    this.flightPathDescription = orders
      .map((order) => order.hospital.name)
      .join(" -> ")
      .concat(" -> Nest");
    this.packagePriorityDescription = orders
      .map((order) => order.priority)
      .join(" -> ");

    this.estimatedReturnBatteryPercentage = Math.round(
      (1 - totalDistance / ZIP_MAX_CUMULATIVE_RANGE_M) * 100
    );

    console.log(
      `Flight launched at ${launchTime} to ${this.flightPathDescription}. Returning at ${this.estimatedReturnBatteryPercentage}% battery`
    );
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
  private activeFlights: { returnTime: number; flight: Flight }[] = []; // Track active flights with return times

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
   * Calculates the Euclidean distance between two locations.
   * @param { { northM: number, eastM: number } } pointA - The starting point coordinates.
   * @param {Hospital} pointB - The destination hospital with coordinates.
   * @returns {number} - The distance between the two points in meters.
   */
  calculateDistanceBetween(
    pointA: { northM: number; eastM: number },
    pointB: Hospital
  ): number {
    const deltaX = pointB.northM - pointA.northM;
    const deltaY = pointB.eastM - pointA.eastM;
    return Math.sqrt(deltaX ** 2 + deltaY ** 2);
  }

  /**
   * Add a new order to our queue.
   * Note: called every time a new order arrives.
   * @param {Order} order the order just placed.
   */
  queueOrder(order: Order): void {
    const isEmergency = order.priority === "Emergency";
    if (isEmergency) {
      const lastEmergencyIndex = this._unfulfilledOrders.findIndex(
        (o) => o.priority !== "Emergency"
      );
      if (lastEmergencyIndex === -1) {
        this._unfulfilledOrders.push(order);
      } else {
        this._unfulfilledOrders.splice(lastEmergencyIndex, 0, order);
      }
    } else {
      this._unfulfilledOrders.push(order);
    }
  }

  /**
   * Checks if Zips are available by releasing any that have completed their flights.
   * @param {number} currentTime - Current time in seconds since midnight.
   */
  releaseReturningZips(currentTime: number): void {
    this.activeFlights = this.activeFlights.filter((flight) => {
      if (flight.returnTime <= currentTime) {
        console.log(`Zip returned at ${currentTime}`);
        return false;
      }
      return true;
    });
  }

  /**
   * Calculates the return time for a given flight based on its total distance.
   * @param {number} launchTime - The launch time of the flight.
   * @param {number} totalDistance - Total round-trip distance in meters.
   * @returns {number} - The expected return time in seconds since midnight.
   */
  calculateReturnTime(launchTime: number, totalDistance: number): number {
    const flightTime = totalDistance / this.zipSpeedMps;
    return launchTime + flightTime;
  }

  /**
   * Determines which flights should be launched right now.
   * Each flight has an ordered list of Orders to serve.
   * Note: will be called periodically (approximately once a minute).
   * @param {number} currentTime Seconds since midnight.
   * @returns {Flight[]} List of Flight objects that launch at this time.
   */
  launchFlights(currentTime: number): Flight[] {
    // First, release any Zips that have returned
    this.releaseReturningZips(currentTime);

    const flights: Flight[] = [];
    const fulfilledOrders: Order[] = [];

    // Calculate available Zips
    let availableZips = this.numZips - this.activeFlights.length;

    // No Zips available to dispatch
    if (availableZips <= 0) {
      console.log("No Zips available to dispatch");
      return flights;
    }

    // Get pending orders up to currentTime
    let pendingOrders = this._unfulfilledOrders.filter(
      (order) => order.time <= currentTime
    );

    if (pendingOrders.length === 0) {
      // No orders to process
      return flights;
    }

    // Sort pending orders by priority (Emergency first), then by age (older orders first)
    pendingOrders.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.time - b.time; // Older orders first
      }
      return a.priority === "Emergency" ? -1 : 1; // Emergency orders first
    });

    console.log({
      pendingOrders,
    });

    while (pendingOrders.length > 0 && availableZips > 0) {
      const { flightOrders, totalDistance } = this.planFlight(
        pendingOrders,
        currentTime
      );
      const isResupplyOnlyFlight = flightOrders.every(
        (order) => order.priority === "Resupply"
      );

      console.log({ flightOrders, totalDistance });

      if (flightOrders.length > 0) {
        // Reserve last 50% of Zips for Emergency flights
        if (isResupplyOnlyFlight && availableZips > this.numZips / 2) {
          console.log("Last 50% of Zips are reserved for Emergency flights");
          break;
        }

        // Delay Resupply-only flights if total distance is less than 50% of max range
        if (
          isResupplyOnlyFlight &&
          totalDistance < this.zipMaxCumulativeRangeM * 0.5
        ) {
          console.log(
            "Resupply flight range is less than 50%, delaying launch"
          );
          break; // Exit the loop, don't launch this flight yet
        }

        const flight = new Flight(currentTime, flightOrders, totalDistance);
        flights.push(flight);

        // Calculate and record return time
        const returnTime = this.calculateReturnTime(currentTime, totalDistance);
        this.activeFlights.push({ returnTime, flight });

        fulfilledOrders.push(...flightOrders);
        availableZips -= 1; // Decrease available Zips directly
      } else {
        // No more flights can be planned with remaining orders and constraints
        break;
      }
    }

    // Remove fulfilled orders from _unfulfilledOrders
    this._unfulfilledOrders = this._unfulfilledOrders.filter(
      (order) => !fulfilledOrders.includes(order)
    );

    if (fulfilledOrders.length > 0) {
      console.log({
        flightsLaunched: flights.length,
        activeFlights: this.activeFlights.length,
        availableZips,
      });
    }

    return flights;
  }

  private findNearestReachableOrder(
    currentLocation: { northM: number; eastM: number },
    orders: Order[],
    totalDistance: number
  ): { nearestOrderIndex: number; minDistance: number } {
    let nearestOrderIndex = -1;
    let minDistance = Infinity;

    // Iterate over the orders to find the nearest reachable one
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      const distance = this.calculateDistanceBetween(
        currentLocation,
        order.hospital
      );

      // Calculate potential total distance including this order
      const potentialTotalDistance = totalDistance + distance;

      // Include return to Nest
      const distanceToNest = this.calculateDistanceBetween(order.hospital, {
        northM: 0,
        eastM: 0,
      } as Hospital);
      const totalTripDistance = potentialTotalDistance + distanceToNest;

      if (
        distance < minDistance &&
        totalTripDistance <= this.zipMaxCumulativeRangeM
      ) {
        minDistance = distance;
        nearestOrderIndex = i;
      }
    }

    return { nearestOrderIndex, minDistance };
  }

  /**
   * Plans a flight by selecting orders based on the nearest neighbor heuristic.
   * @param {Order[]} orders - List of orders to fulfill.
   * @param {number} currentTime - Current time in seconds since midnight.
   * @returns {{ flightOrders: Order[]; totalDistance: number }} - The selected orders and total distance.
   */
  private planFlight(
    orders: Order[],
    currentTime: number
  ): { flightOrders: Order[]; totalDistance: number } {
    let currentLocation = { northM: 0, eastM: 0 }; // Start at the Nest
    let flightOrders: Order[] = [];
    let totalDistance = 0;

    // Separate orders by priority
    const emergencyOrders = orders.filter(
      (order) => order.priority === "Emergency"
    );
    const resupplyOrders = orders.filter(
      (order) => order.priority === "Resupply"
    );

    // First, add Emergency orders to the flight
    while (
      flightOrders.length < this.maxPackagesPerZip &&
      emergencyOrders.length > 0
    ) {
      const { nearestOrderIndex, minDistance } = this.findNearestReachableOrder(
        currentLocation,
        emergencyOrders,
        totalDistance
      );

      if (nearestOrderIndex === -1) {
        break;
      }

      const nearestOrder = emergencyOrders.splice(nearestOrderIndex, 1)[0];
      orders.splice(orders.indexOf(nearestOrder), 1); // Remove from main orders list
      flightOrders.push(nearestOrder);
      totalDistance += minDistance;
      currentLocation = nearestOrder.hospital;
    }

    // If there is remaining capacity and range, add Resupply orders
    while (
      flightOrders.length < this.maxPackagesPerZip &&
      resupplyOrders.length > 0
    ) {
      const { nearestOrderIndex, minDistance } = this.findNearestReachableOrder(
        currentLocation,
        resupplyOrders,
        totalDistance
      );

      if (nearestOrderIndex === -1) {
        break;
      }

      const nearestOrder = resupplyOrders.splice(nearestOrderIndex, 1)[0];
      orders.splice(orders.indexOf(nearestOrder), 1); // Remove from main orders list
      flightOrders.push(nearestOrder);
      totalDistance += minDistance;
      currentLocation = nearestOrder.hospital;
    }

    // Add distance back to the Nest
    const returnToNestDistance = this.calculateDistanceBetween(
      currentLocation,
      { northM: 0, eastM: 0 } as Hospital
    );
    totalDistance += returnToNestDistance;

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
