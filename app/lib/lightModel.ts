/** Small background jobs (writing, photo descriptions, photo requests) can use a cheaper model.
 *  Set VELO_MODEL_LIGHT to turn that on; leave it unset and everything uses VELO_MODEL. */
export const lightModel = (): string => process.env.VELO_MODEL_LIGHT || process.env.VELO_MODEL!;
