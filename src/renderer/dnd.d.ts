declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    "on:consider"?: (event: CustomEvent<DndEvent<any>> & { target: EventTarget & T }) => void;
    "on:finalize"?: (event: CustomEvent<DndEvent<any>> & { target: EventTarget & T }) => void;
    onconsider?: (event: CustomEvent<DndEvent<any>> & { target: EventTarget & T }) => void;
    onfinalize?: (event: CustomEvent<DndEvent<any>> & { target: EventTarget & T }) => void;
  }
}
