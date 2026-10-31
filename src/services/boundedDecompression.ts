/** Decompressed share snapshots stay small enough for a viewer's tab. */
export const MAX_DECOMPRESSED_SHARE_BYTES = 20 * 1024 * 1024;

/**
 * Local backup import is user-initiated and may carry more than a share
 * snapshot, but it still must not let a file expand without a ceiling.
 */
export const MAX_DECOMPRESSED_BACKUP_BYTES = 64 * 1024 * 1024;

const limitBytes = (limit: number): TransformStream<Uint8Array, Uint8Array> => {
    let total = 0;
    return new TransformStream({
        transform(chunk, controller) {
            total += chunk.byteLength;
            if (total > limit) {
                controller.error(new Error('decompressed output is too large'));
                return;
            }
            controller.enqueue(chunk);
        },
    });
};

/**
 * Pipe bytes through a (de)compression stream, optionally stopping as soon as
 * the output crosses a byte ceiling. The ceiling is checked before a chunk is
 * enqueued, so the caller's buffer never grows past the limit by more than the
 * decompressor's current chunk.
 */
export async function pipeThrough(
    bytes: Uint8Array,
    stream: CompressionStream | DecompressionStream,
    maxOutputBytes?: number,
): Promise<Uint8Array> {
    let output: ReadableStream<Uint8Array> = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
    if (maxOutputBytes !== undefined) output = output.pipeThrough(limitBytes(maxOutputBytes));
    return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Gzip decompression with a hard, streaming output ceiling. */
export async function decompressGzipWithLimit(bytes: Uint8Array, maxOutputBytes: number): Promise<Uint8Array> {
    return pipeThrough(bytes, new DecompressionStream('gzip'), maxOutputBytes);
}
