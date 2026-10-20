import type { Database as GeneratedDatabase } from "./database.types";

export type { Json, Tables, Enums, CompositeTypes } from "./database.types";
export { Constants } from "./database.types";

type GeneratedGi = GeneratedDatabase["public"]["Tables"]["gi_location_references"];
type GeneratedGiKeys = "upt_key" | "nama_gi_key";
type ReadOnlyGiKeys<T> = Omit<T, GeneratedGiKeys> & {
  [Key in GeneratedGiKeys]?: never;
};

// Keep linked generator output untouched. Its GI write shapes currently include
// GENERATED ALWAYS keys, but PostgreSQL rejects writes to these columns.
type GiTable = Omit<GeneratedGi, "Insert" | "Update"> & {
  Insert: ReadOnlyGiKeys<GeneratedGi["Insert"]>;
  Update: ReadOnlyGiKeys<GeneratedGi["Update"]>;
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Tables"> & {
    Tables: Omit<GeneratedDatabase["public"]["Tables"], "gi_location_references"> & {
      gi_location_references: GiTable;
    };
  };
};

type Schemas = Omit<Database, "__InternalSupabase">;
type TableOption = keyof Schemas["public"]["Tables"] | { schema: keyof Schemas };
type SchemaTableName<Option extends TableOption> = Option extends { schema: keyof Schemas }
  ? keyof Schemas[Option["schema"]]["Tables"]
  : never;
type WriteShape<
  Option extends TableOption,
  Name extends SchemaTableName<Option>,
  Operation extends "Insert" | "Update",
> = Option extends { schema: keyof Schemas }
  ? Schemas[Option["schema"]]["Tables"][Name] extends Record<Operation, infer Shape>
    ? Shape
    : never
  : Option extends keyof Schemas["public"]["Tables"]
    ? Schemas["public"]["Tables"][Option] extends Record<Operation, infer Shape>
      ? Shape
      : never
    : never;

export type TablesInsert<
  Option extends TableOption,
  Name extends SchemaTableName<Option> = never,
> = WriteShape<Option, Name, "Insert">;

export type TablesUpdate<
  Option extends TableOption,
  Name extends SchemaTableName<Option> = never,
> = WriteShape<Option, Name, "Update">;
