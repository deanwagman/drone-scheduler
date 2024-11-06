import PriorityQueue from "./PriorityQueue";
import Hospital from "./Hospital";
import Flight from "./Flight";
import Order from "./Order";

import logger from "./logger";

// The two acceptable priorities
type Priority = "Emergency" | "Resupply";

const PRIORITY_ORDER: Priority[] = ["Emergency", "Resupply"];

// Reserve this many Zips for emergencies
const RESERVED_EMERGENCY_ZIPS = 4;

export default class ZipScheduler {
  hospitals: Record<string, Hospital>;
  numZips: number;
  maxPackagesPerZip: number;
  zipSpeedMps: number;
  zipMaxCumulativeRangeM: number;
  completeOrderCount: number = 0;

  private _unfulfilledOrders: PriorityQueue;
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

    this._unfulfilledOrders = new PriorityQueue();
  }

  /**
   * Returns the count of unfulfilled orders.
   */
  get unfulfilledOrdersCount(): number {
    return this._unfulfilledOrders.size();
  }

  /**
   * Returns an array of unfulfilled orders for iteration.
   */
  getUnfulfilledOrders(): Order[] {
    return this._unfulfilledOrders.toArray();
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
    // validate distance to hospital and back to Nest
    const distance =
      2 *
      this.calculateDistance(
        { northM: 0, eastM: 0 }, // Nest
        order.hospital
      );

    if (distance > this.zipMaxCumulativeRangeM) {
      logger.error(
        `Order exceeds maximum range. Skipping. Order: ${order.id}, Distance: ${distance}m, Max Range: ${this.zipMaxCumulativeRangeM}m`
      );
      return;
    }

    this._unfulfilledOrders.enqueue(order);
    logger.info(
      `Order queued: ${order.hospital.name} (${
        order.priority
      }), Unfulfilled Orders: ${
        this.unfulfilledOrdersCount
      }, Emergency Orders: ${this.countByPriority(
        "Emergency"
      )}, Resupply Orders: ${this.countByPriority("Resupply")}`
    );
  }

  /**
   * Counts the number of orders by priority.
   * @param priority The priority to count.
   * @returns The count of orders with the specified priority.
   */
  public countByPriority(priority: Priority): number {
    const orders = this._unfulfilledOrders.toArray();
    return orders.filter((o) => o.priority === priority).length;
  }

  /**
   * Releases Zips that have returned by the current time.
   */
  releaseReturningZips(currentTime: number): void {
    this.activeFlights = this.activeFlights.filter((flightEntry) => {
      if (flightEntry.returnTime <= currentTime) {
        logger.info(`Zip returned: ${flightEntry.flight}`);
        this.completeOrderCount += flightEntry.flight.orders.length;

        return false; // Remove from activeFlights
      }
      return true; // Keep in activeFlights
    });
  }

  /**
   * Calculates the return time based on total distance and Zip speed.
   */
  calculateReturnTime(launchTime: number, totalDistance: number): number {
    return launchTime + totalDistance / this.zipSpeedMps;
  }

  /**
   * Launches flights based on current time and available Zips.
   */
  launchFlights(currentTime: number): Flight[] {
    this.releaseReturningZips(currentTime);
    const flights: Flight[] = [];
    let availableZips = this.numZips - this.activeFlights.length;

    if (this._unfulfilledOrders.isEmpty()) return flights;

    while (availableZips > 0 && !this._unfulfilledOrders.isEmpty()) {
      const orders = this._unfulfilledOrders.toArray();

      const resupplyCount = this.countByPriority("Resupply");
      const emergencyCount = this.countByPriority("Emergency");
      const { flightOrders, totalDistance } = this.planFlight();

      if (flightOrders.length === 0) {
        // No orders fit into the flight
        break;
      }

      logger.info(
        `Emergency Orders: ${emergencyCount}, Resupply Orders: ${resupplyCount}, Next: ${orders[0].id}`
      );

      if (emergencyCount && availableZips < 1) {
        logger.error(
          `Skipping emergency flight due to insufficient available Zips. Available Zips: ${
            this.numZips - this.activeFlights.length
          }`
        );
        break;
      }

      // If this is not an emergency flight and we have fewer than RESERVED_EMERGENCY_ZIPS available, skip
      if (!emergencyCount && availableZips < RESERVED_EMERGENCY_ZIPS) {
        logger.warn(
          `Skipping resupply flight due to insufficient resupply Zips. Zips: ${availableZips}, Pending Resupply Orders: ${resupplyCount}`
        );
        break;
      }

      // Dequeue the selected orders from the priority queue based on flightOrders ids
      flightOrders.forEach((order) => {
        const removed = this._unfulfilledOrders.dequeueById(order.id);
        if (!removed) {
          logger.error(`Failed to dequeue order: ${order.id}`);
        } else {
          logger.verbose(`Order dequeued: ${order.id}`);
        }
      });

      // Create and schedule the flight
      const flight = new Flight(currentTime, flightOrders, totalDistance);
      flights.push(flight);

      const returnTime = this.calculateReturnTime(currentTime, totalDistance);
      this.activeFlights.push({ returnTime, flight });

      availableZips -= 1;

      logger.info(`===> Flight launched: AvailableZips: ${availableZips}`);
    }

    return flights;
  }

  /**
   * Plans a single flight by selecting appropriate orders.
   */
  private planFlight(): {
    flightOrders: Order[];
    totalDistance: number;
  } {
    const flightOrders: Order[] = [];
    let totalDistance = 0;
    let currentLocation = { northM: 0, eastM: 0 }; // Start at Nest

    const availableOrders = this._unfulfilledOrders.toArray();

    while (
      flightOrders.length < this.maxPackagesPerZip &&
      availableOrders.length > 0
    ) {
      // Find the nearest order
      let nearestOrderIndex = -1;
      let nearestDistance = Infinity;
      const isEmergency = availableOrders[]

      availableOrders.forEach((order, index) => {
        const distance = this.calculateDistance(
          currentLocation,
          order.hospital
        );

        if (distance < nearestDistance)
          nearestDistance = distance;
          nearestOrderIndex = index;
        }
      });

      if (nearestOrderIndex === -1) break;

      const nearestOrder = availableOrders[nearestOrderIndex];
      const distanceToOrder = this.calculateDistance(
        currentLocation,
        nearestOrder.hospital
      );
      const distanceBackToNest = this.calculateDistance(nearestOrder.hospital, {
        northM: 0,
        eastM: 0,
      });

      const newTotalDistance =
        totalDistance + distanceToOrder + distanceBackToNest;

      // Check if the order can be fulfilled
      if (newTotalDistance <= this.zipMaxCumulativeRangeM) {
        flightOrders.push(nearestOrder);
        totalDistance += distanceToOrder;
        currentLocation = nearestOrder.hospital;

        // Remove the order from the availableOrders
        availableOrders.splice(nearestOrderIndex, 1);
      } else {
        // Remove the order from the availableOrders to prevent repeated attempts
        availableOrders.splice(nearestOrderIndex, 1);
        logger.verbose(
          `Order cannot be fulfilled due to distance constraints. Skipping. Order: ${nearestOrder.id}, Distance: ${newTotalDistance}m, Max Range: ${this.zipMaxCumulativeRangeM}m`
        );
      }
    }

    // Add distance back to Nest
    if (flightOrders.length > 0) {
      totalDistance += this.calculateDistance(currentLocation, {
        northM: 0,
        eastM: 0,
      });
    }

    return { flightOrders, totalDistance };
  }
}
