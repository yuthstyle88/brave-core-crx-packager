// code generated by pbf v4.0.1

export function readCrxFileHeader (pbf, end) {
  return pbf.readFields(
    readCrxFileHeaderField,
    {
      sha256_with_rsa: [],
      sha256_with_ecdsa: [],
      verified_contents: undefined,
      signed_header_data: undefined
    },
    end
  )
}
function readCrxFileHeaderField (tag, obj, pbf) {
  if (tag === 2) {
    obj.sha256_with_rsa.push(
      readAsymmetricKeyProof(pbf, pbf.readVarint() + pbf.pos)
    )
  } else if (tag === 3) {
    obj.sha256_with_ecdsa.push(
      readAsymmetricKeyProof(pbf, pbf.readVarint() + pbf.pos)
    )
  } else if (tag === 4) {
    obj.verified_contents = pbf.readBytes()
  } else if (tag === 10000) {
    obj.signed_header_data = pbf.readBytes()
  }
}
export function writeCrxFileHeader (obj, pbf) {
  if (obj.sha256_with_rsa) {
    for (const item of obj.sha256_with_rsa) {
      pbf.writeMessage(2, writeAsymmetricKeyProof, item)
    }
  }
  if (obj.sha256_with_ecdsa) {
    for (const item of obj.sha256_with_ecdsa) {
      pbf.writeMessage(3, writeAsymmetricKeyProof, item)
    }
  }
  if (obj.verified_contents != null) {
    pbf.writeBytesField(4, obj.verified_contents)
  }
  if (obj.signed_header_data != null) {
    pbf.writeBytesField(10000, obj.signed_header_data)
  }
}

export function readAsymmetricKeyProof (pbf, end) {
  return pbf.readFields(
    readAsymmetricKeyProofField,
    { public_key: undefined, signature: undefined },
    end
  )
}
function readAsymmetricKeyProofField (tag, obj, pbf) {
  if (tag === 1) {
    obj.public_key = pbf.readBytes()
  } else if (tag === 2) {
    obj.signature = pbf.readBytes()
  }
}
export function writeAsymmetricKeyProof (obj, pbf) {
  if (obj.public_key != null) {
    pbf.writeBytesField(1, obj.public_key)
  }
  if (obj.signature != null) {
    pbf.writeBytesField(2, obj.signature)
  }
}

export function readSignedData (pbf, end) {
  return pbf.readFields(readSignedDataField, { crx_id: undefined }, end)
}
function readSignedDataField (tag, obj, pbf) {
  if (tag === 1) {
    obj.crx_id = pbf.readBytes()
  }
}
export function writeSignedData (obj, pbf) {
  if (obj.crx_id != null) {
    pbf.writeBytesField(1, obj.crx_id)
  }
}
