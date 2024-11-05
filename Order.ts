import Hospital from "./Hospital";

// The two acceptable priorities
type Priority = "Emergency" | "Resupply";

const PRIORITY_ORDER: Priority[] = ["Emergency", "Resupply"];

export default class Order {
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
