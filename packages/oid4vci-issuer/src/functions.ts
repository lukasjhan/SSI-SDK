import { CredentialIssuerMetadata, Jwt, JwtVerifyResult, OID4VCICredentialFormat, UniformCredentialRequest } from '@sphereon/oid4vci-common'
import { CredentialDataSupplier, CredentialIssuanceInput, CredentialSignerCallback, VcIssuer, VcIssuerBuilder } from '@sphereon/oid4vci-issuer'
import { getAgentResolver, getDID, getFirstKeyWithRelation, getIdentifier, getKey, IDIDOptions, toDID } from '@sphereon/ssi-sdk-ext.did-utils'
import { ICredential, W3CVerifiableCredential } from '@sphereon/ssi-types'
import { DIDDocument, IIdentifier, IKey, ProofFormat } from '@veramo/core'
import { CredentialPayload } from '@veramo/core/src/types/vc-data-model'
import { bytesToBase64 } from '@veramo/utils'
import { createJWT, decodeJWT, JWTVerifyOptions, verifyJWT } from 'did-jwt'
import { Resolvable } from 'did-resolver'
import { IIssuerOptions, IRequiredContext } from './types/IOID4VCIIssuer'

export function getJwtVerifyCallback({ verifyOpts }: { verifyOpts?: JWTVerifyOptions }, _context: IRequiredContext) {
  return async (args: { jwt: string; kid?: string }): Promise<JwtVerifyResult<DIDDocument>> => {
    const resolver = getAgentResolver(_context, { resolverResolution: true, uniresolverResolution: true, localResolution: true })
    verifyOpts = { ...verifyOpts, resolver: verifyOpts?.resolver } // Resolver seperately as that is a function
    if (!verifyOpts?.resolver || typeof verifyOpts?.resolver?.resolve !== 'function') {
      verifyOpts.resolver = resolver
    }
    const result = await verifyJWT(args.jwt, verifyOpts)
    if (!result.verified) {
      console.log(`JWT invalid: ${args.jwt}`)
      throw Error('JWT did not verify successfully')
    }
    const jwt = (await decodeJWT(args.jwt)) as Jwt
    const kid = args.kid ?? jwt.header.kid
    if (!kid) {
      throw Error('No kid value found')
    }
    const did = kid.split('#')[0]
    const didResolution = await resolver.resolve(did)
    if (!didResolution || !didResolution.didDocument) {
      throw Error(`Could not resolve did: ${did}, metadata: ${didResolution?.didResolutionMetadata}`)
    }
    const didDocument = didResolution.didDocument
    const alg = jwt.header.alg
    return {
      alg,
      kid,
      did,
      didDocument,
      jwt,
    }
  }
}

export async function getAccessTokenKeyRef(
  opts: {
    iss?: string
    keyRef?: string
    didOpts?: IDIDOptions
  },
  context: IRequiredContext
) {
  let keyRef =
    opts.keyRef ??
    opts.didOpts?.identifierOpts?.kid ??
    (typeof opts.didOpts?.identifierOpts.identifier === 'object'
      ? (opts.didOpts?.identifierOpts.identifier as IIdentifier).keys[0].kid
      : !!opts.didOpts?.identifierOpts.kid
      ? opts.didOpts?.identifierOpts.kid
      : undefined)
  if (!keyRef) {
    throw Error('Key ref is needed for access token signer')
  }
  if (keyRef.startsWith('did:')) {
    const did = keyRef.split('#')[0]
    let vm: string | undefined
    if (keyRef.includes('#')) {
      vm = keyRef.split('#')[1]
    }
    const identifier = await getIdentifier({ identifier: did }, context)
    let key: IKey | undefined
    if (vm) {
      key = await getKey(identifier, 'assertionMethod', context, vm)
      keyRef = key?.kid
    }
    if (!key) {
      key = await getFirstKeyWithRelation(identifier, context, 'assertionMethod', false)
      if (!key) {
        key = await getFirstKeyWithRelation(identifier, context, 'verificationMethod', true)
      }
      keyRef = key?.kid
    }
  }
  return keyRef
}

export function getAccessTokenSignerCallback(
  opts: {
    iss?: string
    keyRef?: string
    didOpts?: IDIDOptions
  },
  context: IRequiredContext
) {
  const signer = (data: string | Uint8Array) => {
    let dataString, encoding: 'base64' | undefined
    const keyRef = opts.keyRef ?? opts?.didOpts?.identifierOpts?.kid
    if (!keyRef) {
      throw Error('Cannot sign access tokens without a key ref')
    }
    if (typeof data === 'string') {
      dataString = data
      encoding = undefined
    } else {
      dataString = bytesToBase64(data)
      encoding = 'base64'
    }
    return context.agent.keyManagerSign({ keyRef, data: dataString, encoding })
  }

  async function accessTokenSignerCallback(jwt: Jwt, kid?: string): Promise<string> {
    const issuer = opts?.iss ?? opts.didOpts?.identifierOpts?.identifier.toString()
    if (!issuer) {
      throw Error('No issuer configured for access tokens')
    }
    const result = await createJWT(jwt.payload, { signer, issuer }, { ...jwt.header, typ: 'JWT' })
    return result
  }

  return accessTokenSignerCallback
}

export function getCredentialSignerCallback(didOpts: IDIDOptions, context: IRequiredContext): CredentialSignerCallback<DIDDocument> {
  async function issueVCCallback(args: {
    credentialRequest: UniformCredentialRequest
    credential: CredentialIssuanceInput
    jwtVerifyResult: JwtVerifyResult<DIDDocument>
    format?: OID4VCICredentialFormat
  }): Promise<W3CVerifiableCredential> {
    const { jwtVerifyResult, format } = args
    const credential = args.credential as ICredential // TODO: SDJWT
    let proofFormat: ProofFormat

    proofFormat = format?.includes('ld') ? 'lds' : 'jwt'
    if (!credential.issuer && didOpts.identifierOpts.identifier) {
      credential.issuer = toDID(didOpts.identifierOpts.identifier)
    } else if (typeof credential.issuer === 'object' && !credential.issuer.id && didOpts.identifierOpts.identifier) {
      credential.issuer.id = toDID(didOpts.identifierOpts.identifier)
    }
    const subjectIsArray = Array.isArray(credential.credentialSubject)
    let credentialSubjects = Array.isArray(credential.credentialSubject) ? credential.credentialSubject : [credential.credentialSubject]
    credentialSubjects = credentialSubjects.map((subject) => {
      if (!subject.id) {
        subject.id = jwtVerifyResult.did
      }
      return subject
    })

    credential.credentialSubject = subjectIsArray ? credentialSubjects : credentialSubjects[0]

    const result = await context.agent.createVerifiableCredential({
      credential: credential as CredentialPayload,
      proofFormat,
      removeOriginalFields: false,
      fetchRemoteContexts: true,
      domain: getDID(didOpts.identifierOpts),
    })
    return (proofFormat === 'jwt' && 'jwt' in result.proof ? result.proof.jwt : result) as W3CVerifiableCredential
  }

  return issueVCCallback
}

export async function createVciIssuerBuilder(
  args: {
    issuerOpts: IIssuerOptions
    metadata: CredentialIssuerMetadata
    resolver?: Resolvable
    credentialDataSupplier?: CredentialDataSupplier
  },
  context: IRequiredContext
): Promise<VcIssuerBuilder<DIDDocument>> {
  const { issuerOpts, metadata } = args
  const { didOpts } = issuerOpts
  const builder = new VcIssuerBuilder<DIDDocument>()
  const resolver = args.resolver ?? args?.issuerOpts?.didOpts?.resolveOpts?.resolver ?? args.issuerOpts?.didOpts?.resolveOpts?.jwtVerifyOpts?.resolver
  if (!resolver) {
    throw Error('A Resolver is necessary to verify DID JWTs')
  }
  const jwtVerifyOpts: JWTVerifyOptions = {
    ...args?.issuerOpts?.didOpts?.resolveOpts?.jwtVerifyOpts,
    resolver,
    audience: metadata.credential_issuer,
  }
  builder.withIssuerMetadata(metadata)
  builder.withUserPinRequired(issuerOpts.userPinRequired ?? false)
  builder.withCredentialSignerCallback(getCredentialSignerCallback(didOpts, context))
  builder.withJWTVerifyCallback(getJwtVerifyCallback({ verifyOpts: jwtVerifyOpts }, context))
  if (args.credentialDataSupplier) {
    builder.withCredentialDataSupplier(args.credentialDataSupplier)
  }
  builder.withInMemoryCNonceState()
  builder.withInMemoryCredentialOfferState()
  builder.withInMemoryCredentialOfferURIState()
  builder.build()

  return builder
}

export async function createVciIssuer(
  {
    issuerOpts,
    metadata,
    credentialDataSupplier,
  }: {
    issuerOpts: IIssuerOptions
    metadata: CredentialIssuerMetadata
    credentialDataSupplier?: CredentialDataSupplier
  },
  context: IRequiredContext
): Promise<VcIssuer<DIDDocument>> {
  return (await createVciIssuerBuilder({ issuerOpts, metadata, credentialDataSupplier }, context)).build()
}
