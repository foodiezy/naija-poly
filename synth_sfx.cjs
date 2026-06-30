const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, 'public', 'sfx');

if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function saveWav(filename, samples) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, 1, true); // NumChannels
    view.setUint32(24, SAMPLE_RATE, true); // SampleRate
    view.setUint32(28, SAMPLE_RATE * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        let s = Math.max(-1.0, Math.min(1.0, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    fs.writeFileSync(path.join(OUT_DIR, filename), Buffer.from(buffer));
    console.log(`Generated ${filename}`);
}

function generateTone(freq, durationSec, waveType = 'sine', vol = 0.5) {
    const numSamples = Math.floor(SAMPLE_RATE * durationSec);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        let val = 0;
        if (waveType === 'sine') val = Math.sin(2 * Math.PI * freq * t);
        else if (waveType === 'square') val = Math.sin(2 * Math.PI * freq * t) > 0 ? 1.0 : -1.0;
        else if (waveType === 'saw') val = 2.0 * (t * freq - Math.floor(t * freq + 0.5));
        else if (waveType === 'noise') val = Math.random() * 2.0 - 1.0;

        const env = Math.exp(-3.0 * (i / numSamples));
        samples[i] = val * env * vol;
    }
    return Array.from(samples);
}

function applyEnvelope(samples, attackSec, decaySec, sustainLevel, releaseSec) {
    const attackSamples = Math.floor(attackSec * SAMPLE_RATE);
    const decaySamples = Math.floor(decaySec * SAMPLE_RATE);
    const releaseSamples = Math.floor(releaseSec * SAMPLE_RATE);
    const total = samples.length;
    
    return samples.map((s, i) => {
        let env = 0;
        if (i < attackSamples) env = attackSamples > 0 ? i / attackSamples : 1.0;
        else if (i < attackSamples + decaySamples) env = 1.0 - (1.0 - sustainLevel) * ((i - attackSamples) / decaySamples);
        else if (i < total - releaseSamples) env = sustainLevel;
        else env = sustainLevel * (1.0 - ((i - (total - releaseSamples)) / releaseSamples));
        return s * env;
    });
}

function concat(...lists) {
    return [].concat(...lists);
}

function mix(...lists) {
    const maxLen = Math.max(...lists.map(l => l.length));
    const out = new Array(maxLen).fill(0.0);
    for (const l of lists) {
        for (let i = 0; i < l.length; i++) {
            out[i] += l[i];
        }
    }
    return out;
}

// 1. roll.wav (Dice clack)
function genRoll() {
    let out = [];
    for (let i = 0; i < 3; i++) {
        let noise = generateTone(0, 0.05, 'noise', 0.6);
        noise = applyEnvelope(noise, 0.005, 0.02, 0.0, 0.0);
        out = concat(out, noise, new Array(Math.floor(SAMPLE_RATE * (0.05 + Math.random() * 0.1))).fill(0.0));
    }
    saveWav('roll.wav', out);
}

// 2. cash.wav (Ding)
function genCash() {
    const t1 = applyEnvelope(generateTone(1200, 0.5, 'sine', 0.5), 0.01, 0.4, 0.0, 0.0);
    const t2 = applyEnvelope(generateTone(1600, 0.5, 'sine', 0.3), 0.01, 0.4, 0.0, 0.0);
    saveWav('cash.wav', mix(t1, t2));
}

// 3. rent.wav (Dull thud / Negative blip)
function genRent() {
    const t1 = applyEnvelope(generateTone(150, 0.3, 'saw', 0.4), 0.01, 0.2, 0.0, 0.0);
    saveWav('rent.wav', t1);
}

// 4. draw.wav (Card slide/swoosh)
function genDraw() {
    let noise = generateTone(0, 0.2, 'noise', 0.3);
    noise = applyEnvelope(noise, 0.05, 0.1, 0.5, 0.05);
    saveWav('draw.wav', noise);
}

// 5. jail.wav (Low clang)
function genJail() {
    const t1 = applyEnvelope(generateTone(100, 0.8, 'square', 0.5), 0.01, 0.7, 0.0, 0.0);
    const t2 = applyEnvelope(generateTone(105, 0.8, 'square', 0.5), 0.01, 0.7, 0.0, 0.0);
    saveWav('jail.wav', mix(t1, t2));
}

// 6. build.wav (Knock)
function genBuild() {
    const t1 = applyEnvelope(generateTone(400, 0.1, 'square', 0.4), 0.005, 0.05, 0.0, 0.0);
    saveWav('build.wav', concat(t1, new Array(Math.floor(SAMPLE_RATE * 0.1)).fill(0.0), t1));
}

// 7. your-turn.wav (Positive chime)
function genYourTurn() {
    const t1 = applyEnvelope(generateTone(523.25, 0.15, 'sine', 0.4), 0.01, 0.1, 0.0, 0.0);
    const t2 = applyEnvelope(generateTone(659.25, 0.4, 'sine', 0.4), 0.01, 0.3, 0.0, 0.0);
    saveWav('your-turn.wav', concat(t1, t2));
}

// 8. game-over.wav (Fanfare)
function genGameOver() {
    const t1 = applyEnvelope(generateTone(261.63, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0);
    const t2 = applyEnvelope(generateTone(329.63, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0);
    const t3 = applyEnvelope(generateTone(392.00, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0);
    const t4 = applyEnvelope(generateTone(523.25, 0.8, 'square', 0.2), 0.01, 0.7, 0.0, 0.0);
    saveWav('game-over.wav', concat(t1, t2, t3, t4));
}

genRoll();
genCash();
genRent();
genDraw();
genJail();
genBuild();
genYourTurn();
genGameOver();
