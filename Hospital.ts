export default class Hospital {
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
