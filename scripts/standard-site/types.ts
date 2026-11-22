/**
 * Publisher-only boundary types.
 *
 * The shared Standard.site record model lives in `src/standard-site/records.ts`
 * so the static export and the publisher validate the same shapes. This module
 * keeps just the injectable PDS surface, planning results, and errors.
 */

import {
  DOCUMENT_COLLECTION,
  PUBLICATION_COLLECTION,
} from "../../src/standard-site/identity.ts";
import type {
  PlannedRecord,
  StandardRecord,
} from "../../src/standard-site/records.ts";

export interface RemoteRecord<T extends StandardRecord = StandardRecord> {
  readonly uri: string;
  readonly cid: string;
  readonly value: T;
}

export interface PutRecordInput {
  readonly repo: string;
  readonly collection: typeof PUBLICATION_COLLECTION | typeof DOCUMENT_COLLECTION;
  readonly rkey: string;
  readonly record: StandardRecord;
  /** The remote CID seen during planning, or null to require a create. */
  readonly swapRecord: string | null;
}

export interface PutRecordResult {
  readonly uri: string;
  readonly cid: string;
}

/** Injectable PDS boundary used by the planner and publisher. */
export interface PublisherPds {
  getRecord(
    collection: PlannedRecord["collection"],
    rkey: string,
  ): Promise<RemoteRecord | null>;
  putRecord(input: PutRecordInput): Promise<PutRecordResult>;
}

export type PlannedAction = "create" | "update" | "unchanged";

export interface RecordPlan {
  readonly planned: PlannedRecord;
  readonly remote: RemoteRecord | null;
  readonly action: PlannedAction;
  readonly changes: readonly string[];
}

export interface PublicationPlan {
  readonly did: string;
  readonly publication: RecordPlan;
  readonly documents: readonly RecordPlan[];
}

export class PublisherError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublisherError";
  }
}

export type PdsOperation = "getRecord" | "putRecord";

/** A structured rejection returned by an authenticated PDS request. */
export class PdsError extends PublisherError {
  readonly operation: PdsOperation;
  readonly code: string;
  readonly status: number;

  constructor(
    operation: PdsOperation,
    code: string,
    status: number,
    message: string | undefined,
    options?: ErrorOptions,
  ) {
    super(
      `PDS ${operation} failed (${status} ${code})${message ? `: ${message}` : ""}`,
      options,
    );
    this.name = "PdsError";
    this.operation = operation;
    this.code = code;
    this.status = status;
  }
}
