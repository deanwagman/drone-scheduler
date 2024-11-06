// src/PriorityQueue.ts
import Order, { Priority } from "./Order";

interface PriorityQueueElement {
  order: Order;
}

export default class PriorityQueue {
  private heap: PriorityQueueElement[] = [];

  constructor() {}

  /**
   * Enqueues an order into the priority queue.
   * @param order The order to enqueue.
   */
  enqueue(order: Order): void {
    this.heap.push({ order });
    this.bubbleUp(this.heap.length - 1);
  }

  /**
   * Dequeues the highest priority order from the queue.
   * @returns The dequeued order or null if the queue is empty.
   */
  dequeue(): Order | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!.order;

    const top = this.heap[0].order;
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    return top;
  }

  /**
   * Dequeues an order by ID.
   * @param id The ID of the order to dequeue.
   * @returns The dequeued order or null if the order is not found.
   */
  dequeueById(id: string): Order | null {
    const index = this.heap.findIndex((element) => element.order.id === id);
    if (index === -1) return null;

    const order = this.heap[index].order;
    if (index !== this.heap.length - 1) {
      this.heap[index] = this.heap.pop()!;
      this.bubbleDown(index);
      this.bubbleUp(index);
    } else {
      this.heap.pop();
    }

    return order || null;
  }

  /**
   * Peeks at the highest priority order without removing it.
   * @returns The top order or null if the queue is empty.
   */
  peek(): Order | null {
    return this.heap.length > 0 ? this.heap[0].order : null;
  }

  /**
   * Checks if the priority queue is empty.
   * @returns True if empty, false otherwise.
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Returns the number of elements in the queue.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Returns a shallow copy of the heap array.
   */
  toArray(): Order[] {
    return this.heap.map((element) => element.order);
  }

  /**
   * Bubbles up the element at the given index to maintain heap property.
   * @param index The index of the element to bubble up.
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (
        this.compare(this.heap[index].order, this.heap[parentIndex].order) < 0
      ) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  /**
   * Bubbles down the element at the given index to maintain heap property.
   * @param index The index of the element to bubble down.
   */
  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (
        left < length &&
        this.compare(this.heap[left].order, this.heap[smallest].order) < 0
      ) {
        smallest = left;
      }

      if (
        right < length &&
        this.compare(this.heap[right].order, this.heap[smallest].order) < 0
      ) {
        smallest = right;
      }

      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  /**
   * Swaps two elements in the heap.
   * @param i Index of the first element.
   * @param j Index of the second element.
   */
  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  /**
   * Compares two orders based on priority and time.
   * @param a First order.
   * @param b Second order.
   * @returns Negative if a has higher priority, positive if b has higher priority, zero otherwise.
   */
  private compare(a: Order, b: Order): number {
    const priorityOrder: Priority[] = ["Emergency", "Resupply"];

    const priorityDiff =
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    return a.time - b.time;
  }
}
