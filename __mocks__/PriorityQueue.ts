// __mocks__/PriorityQueue.ts
export default class PriorityQueue {
  private items: Order[] = [];

  enqueue(order: Order) {
    this.items.push(order);
    this.items.sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    );
  }

  dequeue() {
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
