#!/usr/bin/env python3
"""FINAL HERDR's chiptune sounds: square and triangle voices, original tunes.
Run: python3 sounds.py  (writes ../sounds/<name>.mp3, needs ffmpeg)"""
import math
import os
import struct
import subprocess
import tempfile
import wave

RATE = 44100


def freq(note):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def voice(seq, wave_kind="square", duty=0.5, vol=0.25, release=0.04):
    """seq: [(note or None, seconds)] -> samples."""
    out = []
    for note, dur in seq:
        n = int(dur * RATE)
        if note is None:
            out += [0.0] * n
            continue
        f = freq(note)
        attack = int(0.005 * RATE)
        rel = int(min(release, dur / 2) * RATE)
        for i in range(n):
            phase = (i * f / RATE) % 1.0
            if wave_kind == "square":
                s = 1.0 if phase < duty else -1.0
            else:  # triangle
                s = 4 * abs(phase - 0.5) - 1
            env = min(1.0, i / attack) if attack else 1.0
            if i > n - rel:
                env *= (n - i) / rel
            env *= 1 - 0.25 * (i / n)  # a little decay
            out.append(s * vol * env)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [max(-1.0, min(1.0, sum(t[i] if i < len(t) else 0.0 for t in tracks))) for i in range(n)]


def echo(samples, delay=0.09, decay=0.35, times=2):
    out = list(samples) + [0.0] * int(delay * RATE * times)
    for k in range(1, times + 1):
        d = int(delay * RATE * k)
        g = decay ** k
        for i, s in enumerate(samples):
            out[i + d] += s * g
    return out


def write_mp3(name, samples, folder):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        path = tmp.name
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))
    out = os.path.join(folder, f"{name}.mp3")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-codec:a", "libmp3lame", "-q:a", "4", out], check=True)
    os.unlink(path)
    print("wrote", out)


S = 0.11  # a sixteenth at about 136 bpm

SOUNDS = {
    # A hero finished a quest.
    "victory": lambda: mix(
        voice([("G4", S), ("C5", S), ("E5", S), ("G5", 3 * S), ("E5", S), ("G5", 4 * S), (None, S),
               ("F5", 1.5 * S), ("A5", 1.5 * S), ("C6", 6 * S)], duty=0.5, vol=0.22),
        voice([("E4", S), ("G4", S), ("C5", S), ("E5", 3 * S), ("C5", S), ("E5", 4 * S), (None, S),
               ("C5", 1.5 * S), ("F5", 1.5 * S), ("A5", 6 * S)], duty=0.25, vol=0.12),
        voice([("C3", 4 * S), ("G2", 5 * S), (None, S), ("F2", 3 * S), ("C3", 6 * S)], "triangle", vol=0.35),
    ),
    # A hero needs you.
    "blocked": lambda: echo(voice([("A5", 0.07), (None, 0.04), ("A5", 0.07), (None, 0.04), ("E6", 0.22)], duty=0.25, vol=0.22)),
    # A class gains a level.
    "levelup": lambda: echo(voice([(n, 0.055) for n in ("C5", "E5", "G5", "C6", "E6", "G6")] + [("C7", 0.3)], duty=0.25, vol=0.18), 0.07, 0.3),
    # An achievement.
    "achievement": lambda: echo(voice([("E6", 0.07), ("B6", 0.07), ("E7", 0.07), ("G#6", 0.07), ("B6", 0.07), ("E7", 0.35)], duty=0.125, vol=0.16), 0.1, 0.4, 3),
    # Menu cursor and confirm.
    "cursor": lambda: voice([("E6", 0.035)], duty=0.25, vol=0.14, release=0.015),
    "select": lambda: voice([("A5", 0.045), ("E6", 0.08)], duty=0.25, vol=0.16, release=0.02),
    # The title screen's theme.
    "title": lambda: mix(
        voice([("C5", 4 * S), ("G4", 2 * S), ("C5", 2 * S), ("E5", 4 * S), ("D5", 2 * S), ("C5", 2 * S), ("D5", 6 * S), (None, 2 * S),
               ("E5", 4 * S), ("G5", 2 * S), ("E5", 2 * S), ("A5", 4 * S), ("G5", 2 * S), ("F5", 2 * S), ("G5", 4 * S), ("C6", 8 * S)],
              duty=0.5, vol=0.2, release=0.06),
        voice([("C3", 8 * S), ("G2", 8 * S), ("A2", 8 * S), ("G2", 8 * S), ("F2", 8 * S), ("C3", 12 * S)], "triangle", vol=0.35, release=0.08),
        voice([(None, 32 * S), ("C5", 4 * S), ("E5", 2 * S), ("C5", 2 * S), ("F5", 4 * S), ("E5", 2 * S), ("D5", 2 * S), ("E5", 4 * S), ("G5", 8 * S)],
              duty=0.25, vol=0.09, release=0.06),
    ),
}

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sounds")
    os.makedirs(out, exist_ok=True)
    for name, make in SOUNDS.items():
        write_mp3(name, make(), out)
