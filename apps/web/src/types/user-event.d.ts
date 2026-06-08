declare module '@testing-library/user-event' {
  interface UserEvent {
    setup(): UserEvent;
    click(element: Element): Promise<void>;
    type(element: Element, text: string): Promise<void>;
    clear(element: Element): Promise<void>;
    selectOptions(element: Element, values: string | string[]): Promise<void>;
    upload(element: Element, file: File | File[]): Promise<void>;
    tab(): Promise<void>;
    keyboard(text: string): Promise<void>;
  }
  const userEvent: UserEvent;
  export default userEvent;
}
