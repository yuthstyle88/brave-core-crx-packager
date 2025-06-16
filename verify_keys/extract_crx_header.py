from crx3_pb2 import CrxFileHeader
import base64

def to_component_id(crx_id_bytes):
    # แปลง byte เป็น hex string
    hex_string = crx_id_bytes.hex()
    # แทนแต่ละตัวอักษร (0-9a-f) ด้วย 'a' ถึง 'p'
    return ''.join(chr(ord('a') + int(c, 16)) for c in hex_string)

def format_cpp_array(name, byte_data):
    lines = []
    hex_bytes = [f"0x{b:02x}" for b in byte_data]
    for i in range(0, len(hex_bytes), 8):
        lines.append("    " + ", ".join(hex_bytes[i:i+8]) + ",")
    result = f"constexpr uint8_t {name}[] = {{\n" + "\n".join(lines).rstrip(",") + "\n};"
    return result

# Read from a .crx file and extract the header
with open("../build/local-data-files-updater/local-data-files-updater-default.crx", "rb") as f:
    raw = f.read()

# Extract CRX header size (little endian 4 bytes at offset 8)
header_size = int.from_bytes(raw[8:12], byteorder='little')
header_bin = raw[:12 + header_size]  # Include magic + version + header size + header datacd


# Now use the header content for further parsing
raw = header_bin

magic = raw[:4]
version = raw[4:8]
header_len = int.from_bytes(raw[8:12], byteorder="little")
header_data = raw[12:12 + header_len]  # ต้องยาว = 1140 bytes

if magic != b"Cr24":
    print("Invalid magic number")
elif version != b"\x03\x00\x00\x00":
    print("Unexpected CRX version")
elif len(header_data) != header_len:
    print(f"Header length mismatch: expected {header_len}, got {len(header_data)}")
else:
    header = CrxFileHeader()
    try:
        header.ParseFromString(header_data)  # ← สำคัญมาก
        import hashlib

        for i, proof in enumerate(header.sha256_with_rsa):
            pub_key = proof.public_key
            signature = proof.signature
            sha256_hash = hashlib.sha256(pub_key).digest()
            crx_id = sha256_hash[:16]

            print(f"\n=== Proof #{i+1} ===")
            print(f"{'crx_id (SHA-256 pubkey[:16])':30}: {crx_id.hex()}")


            component_id = to_component_id(crx_id)
            print(f"{'Component ID':30}: {component_id}")
            print(f"{'Public Key Length':30}: {len(pub_key)} bytes")
            print(f"{'Public Key (base64)':30}:\n{base64.b64encode(pub_key).decode()}")
            sha256_hash = hashlib.sha256(pub_key).digest()

            print(f"{'Public Key SHA256 Hash (hex)':30}: {sha256_hash.hex()}")
            print("\n" + format_cpp_array("kExtractedPublicKeyHash", sha256_hash))
            print(f"{'Signature Length':30}: {len(signature)} bytes")
            print(f"{'Signature (hex)':30}:\n{signature.hex()}")

        print(f"\n{'Signed Header Data':30}: {header.signed_header_data.hex()}")
    except Exception as e:
        print("Parse error:", e)