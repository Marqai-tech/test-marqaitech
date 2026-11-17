#!/usr/bin/env python3
"""Parse APK Signing Block (v2/v3) signer certificates -> SHA-256 fingerprints.
APK v2 layout: [len][pairs][len][magic] before Central Directory; pair id 0x7109871a=v2, 0xf05368c0=v3.
signer: [signed-data][signatures][public-key]; certificates live inside signed-data.
"""
import struct, sys, hashlib

def u32(b, p):
    return struct.unpack_from('<I', b, p)[0]

def parse_scheme(body):
    p = 0
    u32(body, p)                 # signers sequence length
    p += 4
    u32(body, p)                 # signer length
    p += 4
    sdl = u32(body, p)           # signed data length
    sd = body[p + 4: p + 4 + sdl]
    p += 4 + sdl
    p += 4 + u32(body, p)        # skip signatures
    p += 4 + u32(body, p)        # skip public key
    q = 0
    q += 4 + u32(sd, q)          # skip digests
    u32(sd, q)                   # certificates sequence length
    q += 4
    cl = u32(sd, q)              # first certificate length
    cert = sd[q + 4: q + 4 + cl]
    return hashlib.sha256(cert).hexdigest().upper()

def cert_shas(path):
    data = open(path, 'rb').read()
    eocd = data.rfind(b'PK\x05\x06')
    if eocd < 0:
        return ['NO-EOCD']
    cd_off = struct.unpack_from('<I', data, eocd + 16)[0]
    mi = data.rfind(b'APK Sig Block 42', 0, cd_off)
    if mi < 0:
        return ['NO-SIGNING-BLOCK(v2/v3 absent)']
    S = struct.unpack_from('<Q', data, mi - 8)[0]
    pos = cd_off - S
    end = cd_off - 24
    out = []
    while pos < end:
        plen = u32(data, pos) if False else struct.unpack_from('<Q', data, pos)[0]
        pid = u32(data, pos + 8)
        body = data[pos + 12: pos + 8 + plen]
        if pid in (0x7109871a, 0xf05368c0):
            sch = 'v2' if pid == 0x7109871a else 'v3'
            try:
                sha = parse_scheme(body)
                out.append(sch + ' cert-SHA256=' + ':'.join(sha[i:i+2] for i in range(0, 64, 2)))
            except Exception as e:
                out.append(sch + ' PARSE-ERR ' + str(e))
        pos += 8 + plen
    return out or ['NO-V2/V3-PAIRS']

for f in sys.argv[1:]:
    print(f'=== {f}')
    for line in cert_shas(f):
        print('  ' + line)
