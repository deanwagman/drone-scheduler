// ZipScheduler.test.ts

// ========================
// Jest Mocks
// ========================

// Mock the PriorityQueue module with proper default export handling
jest.mock("./PriorityQueue", () => ({
  __esModule: true, // Indicates that this is an ES module
  default: jest.fn().mockImplementation(() => new PriorityQueueMock()),
}));

// Mock the logger module
jest.mock("./logger", () => ({
  __esModule: true, // Indicates that this is an ES module
  default: {
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
  },
}));

// ========================
// Imports
// ========================

// Import modules after mocking
import ZipScheduler from "./FlightScheduler";
import PriorityQueue from "./PriorityQueue"; // This will be the mocked version
import mockedLogger from "./logger"; // This will be the mocked logger

// Import the actual types from your codebase
// Adjust the paths based on your project structure
import Hospital from "./Hospital"; // Assuming Hospital is exported from Hospital.ts
import Order from "./Order"; // Assuming Order is exported from Order.ts
import Flight from "./Flight"; // Assuming Flight is exported from Flight.ts

// ========================
// Mock Implementations
// ========================

type Priority = "Emergency" | "Resupply";
// Define the mock PriorityQueue class
class PriorityQueueMock {
  private items: Order[] = [];

  enqueue(order: Order) {
    this.items.push(order);
    // Sort based on PRIORITY_ORDER
    this.items.sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );
  }

  dequeue(): Order | null {
    return this.items.shift() || null;
  }

  dequeueById(id: string): boolean {
    const index = this.items.findIndex((order) => order.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  toArray(): Order[] {
    return [...this.items];
  }
}

// Define the priority order as per your actual code
const PRIORITY_ORDER: Priority[] = ["Emergency", "Resupply"];

// ========================
// Test Suite
// ========================

describe("ZipScheduler", () => {
  let hospitals: Record<string, Hospital>;
  let zipScheduler: ZipScheduler;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Define mock hospitals with 'name', 'northM', and 'eastM'
    hospitals = {
      hospitalA: { name: "Hospital A", northM: 1000, eastM: 1000 },
      hospitalB: { name: "Hospital B", northM: 2000, eastM: 2000 },
      hospitalC: { name: "Hospital C", northM: 3000, eastM: 3000 },
    };

    // Initialize ZipScheduler with mock data
    zipScheduler = new ZipScheduler(
      hospitals,
      5, // numZips
      10, // maxPackagesPerZip
      10, // zipSpeedMps
      10000 // zipMaxCumulativeRangeM
    );
  });

  describe("Initialization", () => {
    it("should initialize with correct properties", () => {
      expect(zipScheduler.hospitals).toEqual(hospitals);
      expect(zipScheduler.numZips).toBe(5);
      expect(zipScheduler.maxPackagesPerZip).toBe(10);
      expect(zipScheduler.zipSpeedMps).toBe(10);
      expect(zipScheduler.zipMaxCumulativeRangeM).toBe(10000);
      expect(zipScheduler.completeOrderCount).toBe(0);
      expect(zipScheduler.unfulfilledOrdersCount).toBe(0);
    });
  });

  describe("queueOrder", () => {
    it("should enqueue a valid order", () => {
      const order: Order = {
        id: "order1",
        hospital: hospitals.hospitalA, // Includes 'name'
        priority: "Emergency",
        time: Date.now(),
      };

      zipScheduler.queueOrder(order);

      expect(zipScheduler.unfulfilledOrdersCount).toBe(1);
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Order queued")
      );
    });

    it("should reject an order that exceeds max cumulative range", () => {
      const farHospital: Hospital = {
        name: "Far Hospital",
        northM: 5000,
        eastM: 5000,
      };
      const order: Order = {
        id: "order2",
        hospital: farHospital, // Includes 'name'
        priority: "Resupply",
        time: Date.now(),
      };

      zipScheduler.queueOrder(order);

      expect(zipScheduler.unfulfilledOrdersCount).toBe(0);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Order exceeds maximum range")
      );
    });
  });

  describe("countByPriority", () => {
    it("should correctly count orders by priority", () => {
      const orders: Order[] = [
        {
          id: "order1",
          hospital: hospitals.hospitalA,
          priority: "Emergency",
          time: Date.now(),
        },
        {
          id: "order2",
          hospital: hospitals.hospitalB,
          priority: "Resupply",
          time: Date.now(),
        },
        {
          id: "order3",
          hospital: hospitals.hospitalC,
          priority: "Emergency",
          time: Date.now(),
        },
      ];

      orders.forEach((order) => zipScheduler.queueOrder(order));

      expect(zipScheduler.countByPriority("Emergency")).toBe(2);
      expect(zipScheduler.countByPriority("Resupply")).toBe(1);
    });
  });

  describe("calculateDistance", () => {
    it("should correctly calculate straight-line distance", () => {
      const pointA = { northM: 0, eastM: 0 };
      const pointB = { northM: 3, eastM: 4 };
      const distance = zipScheduler.calculateDistance(pointA, pointB);
      expect(distance).toBe(5);
    });
  });

  describe("launchFlights", () => {
    it("should launch a flight when zips are available and orders exist", () => {
      const order1: Order = {
        id: "order1",
        hospital: hospitals.hospitalA,
        priority: "Emergency",
        time: Date.now(),
      };
      const order2: Order = {
        id: "order2",
        hospital: hospitals.hospitalB,
        priority: "Resupply",
        time: Date.now(),
      };

      zipScheduler.queueOrder(order1);
      zipScheduler.queueOrder(order2);

      const currentTime = 1000;
      const flights = zipScheduler.launchFlights(currentTime);

      expect(flights.length).toBe(1);

      // Accessing private member using type assertion
      expect((zipScheduler as any).activeFlights.length).toBe(1);
      expect(zipScheduler.getUnfulfilledOrders().length).toBe(0);
      // Depending on implementation, 'Flight completed' log may not be called immediately
      // Adjust expectations based on actual behavior
    });

    it("should prioritize Emergency orders over Resupply", () => {
      const order1: Order = {
        id: "order1",
        hospital: hospitals.hospitalA,
        priority: "Resupply",
        time: Date.now(),
      };
      const order2: Order = {
        id: "order2",
        hospital: hospitals.hospitalB,
        priority: "Emergency",
        time: Date.now(),
      };

      zipScheduler.queueOrder(order1);
      zipScheduler.queueOrder(order2);

      const currentTime = 1000;
      const flights = zipScheduler.launchFlights(currentTime);

      expect(flights.length).toBe(1);
      expect(flights[0].orders[0].id).toBe("order2"); // Emergency order should be first
      expect(flights[0].orders[1].id).toBe("order1"); // Resupply follows
    });

    it("should not exceed maxPackagesPerZip", () => {
      // Create more orders than maxPackagesPerZip
      const maxPackages = zipScheduler.maxPackagesPerZip;
      const orders: Order[] = [];

      for (let i = 1; i <= maxPackages + 5; i++) {
        orders.push({
          id: `order${i}`,
          hospital: hospitals.hospitalA,
          priority: "Resupply",
          time: Date.now(),
        });
      }

      orders.forEach((order) => zipScheduler.queueOrder(order));

      const currentTime = 1000;
      const flights = zipScheduler.launchFlights(currentTime);

      expect(flights.length).toBe(1);
      expect(flights[0].orders.length).toBe(maxPackages);
      expect(zipScheduler.unfulfilledOrdersCount).toBe(5);
    });

    it("should handle releasing returning zips correctly", () => {
      const order: Order = {
        id: "order1",
        hospital: hospitals.hospitalA,
        priority: "Emergency",
        time: Date.now(),
      };

      zipScheduler.queueOrder(order);

      const launchTime = 1000;
      const flights = zipScheduler.launchFlights(launchTime);

      expect(flights.length).toBe(1);
      expect((zipScheduler as any).activeFlights.length).toBe(1);

      // Simulate time passing to after returnTime
      const flight = flights[0];
      const returnTime = zipScheduler.calculateReturnTime(
        launchTime,
        flight.totalDistance
      );

      zipScheduler.releaseReturningZips(returnTime + 1);

      expect((zipScheduler as any).activeFlights.length).toBe(0);
      expect(zipScheduler.completeOrderCount).toBe(1);
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Flight completed")
      );
    });

    it("should skip launching if not enough zips reserved for emergencies", () => {
      // To modify RESERVED_EMERGENCY_Zips, adjust ZipScheduler to accept it as a parameter
      // For this example, we'll assume it's a configurable property

      // Extend ZipScheduler to accept reservedEmergencyZips via constructor for testing
      // Modify the ZipScheduler class accordingly in your actual codebase

      // Since we cannot modify the actual class here, we'll use type assertion to set it
      (zipScheduler as any).RESERVED_EMERGENCY_ZIPS = 6; // More than available zips

      const orders: Order[] = [
        {
          id: "order1",
          hospital: hospitals.hospitalA,
          priority: "Resupply",
          time: Date.now(),
        },
      ];

      orders.forEach((order) => zipScheduler.queueOrder(order));

      const currentTime = 1000;
      const flights = zipScheduler.launchFlights(currentTime);

      expect(flights.length).toBe(0);
      expect(mockedLogger.verbose).toHaveBeenCalledWith(
        expect.stringContaining("Skipping resupply flight")
      );

      // Restore original RESERVED_EMERGENCY_Zips if necessary
      // (Assuming the original value was 4)
      (zipScheduler as any).RESERVED_EMERGENCY_ZIPS = 4;
    });
  });

  describe("planFlight", () => {
    it("should plan a flight with orders within range", () => {
      const orders: Order[] = [
        {
          id: "order1",
          hospital: hospitals.hospitalA,
          priority: "Resupply",
          time: Date.now(),
        },
        {
          id: "order2",
          hospital: hospitals.hospitalB,
          priority: "Resupply",
          time: Date.now(),
        },
      ];

      orders.forEach((order) => zipScheduler.queueOrder(order));

      // Access the private method using type assertion
      const planFlight = (zipScheduler as any).planFlight;

      const { flightOrders, totalDistance } = planFlight();

      expect(flightOrders.length).toBe(2);
      expect(totalDistance).toBeGreaterThan(0);
    });

    it("should not include orders that would exceed max range", () => {
      const distantHospital: Hospital = {
        name: "Distant Hospital",
        northM: 7000,
        eastM: 7000,
      };
      const orders: Order[] = [
        {
          id: "order1",
          hospital: distantHospital,
          priority: "Resupply",
          time: Date.now(),
        },
        {
          id: "order2",
          hospital: hospitals.hospitalA,
          priority: "Resupply",
          time: Date.now(),
        },
      ];

      orders.forEach((order) => zipScheduler.queueOrder(order));

      const planFlight = (zipScheduler as any).planFlight;

      const { flightOrders, totalDistance } = planFlight();

      expect(flightOrders.length).toBe(1);
      expect(flightOrders[0].id).toBe("order2");
      expect(totalDistance).toBeLessThanOrEqual(
        zipScheduler.zipMaxCumulativeRangeM
      );
    });
  });
});
