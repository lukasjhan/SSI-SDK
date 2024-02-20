export type UniformCredential = {
  id: string
  credentialType: CredentialTypeEnum
  documentFormat: CredentialDocumentFormat
  raw: string
  hash: string
  type: string
  issuerCorrelationType: CredentialCorrelationType
  subjectCorrelationType?: CredentialCorrelationType
  issuerCorrelationId: string
  subjectCorrelationId?: string
  last_verified_state?: CredentialStateType
  tenantId?: string
  createdAt: Date
  lastUpdatedAt: Date
  expiresAt: Date
}

export enum CredentialTypeEnum {
  VC = 'vc',
  VP = 'vp',
}

export enum CredentialDocumentFormat {
  JSON_LD = 'JSON-LD',
  JWT = 'JWT',
  SD_JWT = 'SD-JWT',
  MDOC = 'MDOC',
}

export enum CredentialCorrelationType {
  DID = 'did',
}

export enum CredentialStateType {
  REVOKED = 'revoked',
  VERIFIED = 'verified',
  EXPIRED = 'expired',
}
