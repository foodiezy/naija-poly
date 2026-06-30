import math
import struct
import wave
import os
import random

SAMPLE_RATE = 44100
OUT_DIR = "public/sfx"

if not os.path.exists(OUT_DIR):
    os.makedirs(OUT_DIR)

def save_wav(filename, samples):
    path = os.path.join(OUT_DIR, filename)
    with wave.open(path, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        # Convert floats (-1.0 to 1.0) to 16-bit PCM
        pcm_samples = []
        for s in samples:
            s = max(-1.0, min(1.0, s))
            pcm_samples.append(int(s * 32767.0))
        wav_file.writeframes(struct.pack(f"<{len(pcm_samples)}h", *pcm_samples))
    print(f"Generated {path}")

def generate_tone(freq, duration_sec, wave_type='sine', vol=0.5):
    samples = []
    num_samples = int(SAMPLE_RATE * duration_sec)
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        if wave_type == 'sine':
            val = math.sin(2 * math.pi * freq * t)
        elif wave_type == 'square':
            val = 1.0 if math.sin(2 * math.pi * freq * t) > 0 else -1.0
        elif wave_type == 'saw':
            val = 2.0 * (t * freq - math.floor(t * freq + 0.5))
        elif wave_type == 'noise':
            val = random.uniform(-1.0, 1.0)
        else:
            val = 0
        
        # Envelope: quick attack, exponential decay
        env = math.exp(-3.0 * (i / num_samples))
        samples.append(val * env * vol)
    return samples

def apply_envelope(samples, attack_sec, decay_sec, sustain_level, release_sec):
    attack_samples = int(attack_sec * SAMPLE_RATE)
    decay_samples = int(decay_sec * SAMPLE_RATE)
    release_samples = int(release_sec * SAMPLE_RATE)
    total = len(samples)
    
    out = []
    for i in range(total):
        if i < attack_samples:
            env = i / attack_samples if attack_samples > 0 else 1.0
        elif i < attack_samples + decay_samples:
            # decay to sustain
            prog = (i - attack_samples) / decay_samples
            env = 1.0 - (1.0 - sustain_level) * prog
        elif i < total - release_samples:
            env = sustain_level
        else:
            # release
            prog = (i - (total - release_samples)) / release_samples
            env = sustain_level * (1.0 - prog)
        out.append(samples[i] * env)
    return out

def concat(*sample_lists):
    out = []
    for s in sample_lists:
        out.extend(s)
    return out

def mix(*sample_lists):
    max_len = max(len(s) for s in sample_lists)
    out = [0.0] * max_len
    for s in sample_lists:
        for i in range(len(s)):
            out[i] += s[i]
    return out

# 1. roll.wav (Dice clack)
def gen_roll():
    out = []
    for _ in range(3):
        noise = generate_tone(0, 0.05, 'noise', 0.6)
        # Apply strict envelope to make it clicky
        noise = apply_envelope(noise, 0.005, 0.02, 0.0, 0.0)
        out.extend(noise)
        out.extend([0.0] * int(SAMPLE_RATE * random.uniform(0.05, 0.15)))
    save_wav("roll.wav", out)

# 2. cash.wav (Ding)
def gen_cash():
    t1 = apply_envelope(generate_tone(1200, 0.5, 'sine', 0.5), 0.01, 0.4, 0.0, 0.0)
    t2 = apply_envelope(generate_tone(1600, 0.5, 'sine', 0.3), 0.01, 0.4, 0.0, 0.0)
    save_wav("cash.wav", mix(t1, t2))

# 3. rent.wav (Dull thud / Negative blip)
def gen_rent():
    t1 = apply_envelope(generate_tone(150, 0.3, 'saw', 0.4), 0.01, 0.2, 0.0, 0.0)
    save_wav("rent.wav", t1)

# 4. draw.wav (Card slide/swoosh)
def gen_draw():
    noise = generate_tone(0, 0.2, 'noise', 0.3)
    noise = apply_envelope(noise, 0.05, 0.1, 0.5, 0.05)
    save_wav("draw.wav", noise)

# 5. jail.wav (Low clang)
def gen_jail():
    t1 = apply_envelope(generate_tone(100, 0.8, 'square', 0.5), 0.01, 0.7, 0.0, 0.0)
    t2 = apply_envelope(generate_tone(105, 0.8, 'square', 0.5), 0.01, 0.7, 0.0, 0.0)
    save_wav("jail.wav", mix(t1, t2))

# 6. build.wav (Knock)
def gen_build():
    t1 = apply_envelope(generate_tone(400, 0.1, 'square', 0.4), 0.005, 0.05, 0.0, 0.0)
    save_wav("build.wav", concat(t1, [0.0]*int(SAMPLE_RATE*0.1), t1))

# 7. your-turn.wav (Positive chime)
def gen_your_turn():
    t1 = apply_envelope(generate_tone(523.25, 0.15, 'sine', 0.4), 0.01, 0.1, 0.0, 0.0)
    t2 = apply_envelope(generate_tone(659.25, 0.4, 'sine', 0.4), 0.01, 0.3, 0.0, 0.0)
    save_wav("your-turn.wav", concat(t1, t2))

# 8. game-over.wav (Fanfare)
def gen_game_over():
    # C major arpeggio: C4, E4, G4, C5
    t1 = apply_envelope(generate_tone(261.63, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0)
    t2 = apply_envelope(generate_tone(329.63, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0)
    t3 = apply_envelope(generate_tone(392.00, 0.15, 'square', 0.2), 0.01, 0.1, 0.0, 0.0)
    t4 = apply_envelope(generate_tone(523.25, 0.8, 'square', 0.2), 0.01, 0.7, 0.0, 0.0)
    save_wav("game-over.wav", concat(t1, t2, t3, t4))

if __name__ == "__main__":
    gen_roll()
    gen_cash()
    gen_rent()
    gen_draw()
    gen_jail()
    gen_build()
    gen_your_turn()
    gen_game_over()
