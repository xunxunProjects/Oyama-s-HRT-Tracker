export const MIN_F0 = 70;
export const MAX_F0 = 500;
export const MIN_CLARITY = 0.8;
export const MIN_VOICED_RATIO = 0.3;
export const MIN_VOICED_FRAMES = 20;

const TARGET_SAMPLE_RATE = 16000;
const YIN_THRESHOLD = 0.15;
const MIN_RMS = 0.001;
const NOISE_FLOOR_MIN = 0.004;

export interface PitchReading {
    f0: number;
    clarity: number;
}

export interface PitchSummary {
    medianF0: number;
    p5: number;
    p95: number;
    voicedRatio: number;
    voicedFrames: number;
    totalFrames: number;
}

export const frameRms = (frame: Float32Array): number => {
    if (frame.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    return Math.sqrt(sum / frame.length);
};

const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * p;
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    if (lower === upper) return sorted[lower];
    const weight = pos - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

/**
 * Downsampling by an integer factor keeps the YIN search cheap on a phone.
 * Averaging before decimation is a crude anti-alias filter; the pitch range
 * survives it, and the alternative is a difference function four times the
 * size on every frame.
 */
const downsample = (frame: Float32Array, sampleRate: number): { samples: Float32Array; rate: number } => {
    const factor = Math.max(1, Math.floor(sampleRate / TARGET_SAMPLE_RATE));
    if (factor === 1) return { samples: frame, rate: sampleRate };
    const length = Math.floor(frame.length / factor);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let j = 0; j < factor; j++) sum += frame[i * factor + j];
        samples[i] = sum / factor;
    }
    return { samples, rate: sampleRate / factor };
};

export const detectPitch = (frame: Float32Array, sampleRate: number): PitchReading | null => {
    if (frame.length < 512 || sampleRate <= 0) return null;
    const { samples, rate } = downsample(frame, sampleRate);
    const rms = frameRms(samples);
    if (rms < MIN_RMS) return null;

    let mean = 0;
    for (let i = 0; i < samples.length; i++) mean += samples[i];
    mean /= samples.length;
    for (let i = 0; i < samples.length; i++) samples[i] -= mean;

    const tauMin = Math.max(2, Math.floor(rate / MAX_F0));
    const tauMax = Math.min(Math.ceil(rate / MIN_F0), Math.floor(samples.length / 2));
    if (tauMax <= tauMin + 2) return null;

    const window = samples.length - tauMax;
    const difference = new Float64Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
        let sum = 0;
        for (let i = 0; i < window; i++) {
            const delta = samples[i] - samples[i + tau];
            sum += delta * delta;
        }
        difference[tau] = sum;
    }

    const cmnd = new Float64Array(tauMax + 1);
    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
        running += difference[tau];
        cmnd[tau] = running > 0 ? (difference[tau] * tau) / running : 1;
    }

    let bestTau = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cmnd[tau] < YIN_THRESHOLD) {
            while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
            bestTau = tau;
            break;
        }
    }

    if (bestTau === -1) {
        let minTau = tauMin;
        for (let tau = tauMin + 1; tau <= tauMax; tau++) if (cmnd[tau] < cmnd[minTau]) minTau = tau;
        bestTau = minTau;
    }

    const clarity = 1 - cmnd[bestTau];
    if (clarity < MIN_CLARITY) return null;

    const left = cmnd[bestTau - 1];
    const center = cmnd[bestTau];
    const right = cmnd[bestTau + 1];
    const denominator = 2 * (2 * center - left - right);
    const shift = denominator === 0 ? 0 : Math.max(-1, Math.min(1, (right - left) / denominator));
    const period = bestTau + shift;
    if (period <= 0) return null;

    const f0 = rate / period;
    if (f0 < MIN_F0 || f0 > MAX_F0) return null;
    return { f0, clarity };
};

export const summarizePitch = (frames: Float32Array[], sampleRate: number): PitchSummary | null => {
    if (frames.length === 0) return null;

    const rms = frames.map(frameRms);
    const sortedRms = [...rms].sort((a, b) => a - b);
    // The 20th percentile x3 is the design's noise estimate. Cap it at half
    // the median so a recording that is mostly voiced (only a fifth silent)
    // does not lift the floor above its own speech frames.
    const noiseFloor = Math.max(
        NOISE_FLOOR_MIN,
        Math.min(percentile(sortedRms, 0.2) * 3, percentile(sortedRms, 0.5) * 0.5),
    );
    const voiced: number[] = [];

    for (let i = 0; i < frames.length; i++) {
        if (rms[i] < noiseFloor) continue;
        const reading = detectPitch(frames[i], sampleRate);
        if (reading) voiced.push(reading.f0);
    }

    const totalFrames = frames.length;
    const voicedFrames = voiced.length;
    const voicedRatio = voicedFrames / totalFrames;
    if (voicedFrames < MIN_VOICED_FRAMES || voicedRatio < MIN_VOICED_RATIO) return null;

    const sorted = [...voiced].sort((a, b) => a - b);
    return {
        medianF0: percentile(sorted, 0.5),
        p5: percentile(sorted, 0.05),
        p95: percentile(sorted, 0.95),
        voicedRatio,
        voicedFrames,
        totalFrames,
    };
};
