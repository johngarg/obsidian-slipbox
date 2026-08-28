export type PluginDataWriteResult = "saved" | "failed";

export interface SerializedPluginDataWriterEnvironment<Data> {
  write(data: Data): Promise<void>;
  reportError(error: unknown): void;
}

/** Serialize plugin-data writes while allowing the queue to recover from failure. */
export class SerializedPluginDataWriter<Data> {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly environment: SerializedPluginDataWriterEnvironment<Data>,
  ) {}

  async save(data: Data): Promise<PluginDataWriteResult> {
    const write = this.tail.then(() => this.environment.write(data));
    this.tail = write.catch(() => undefined);
    try {
      await write;
      return "saved";
    } catch (error) {
      this.environment.reportError(error);
      return "failed";
    }
  }
}
