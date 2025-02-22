import { Bls12381G2KeyPair } from '@mattrglobal/jsonld-signatures-bbs'
import { KeyType } from '@sphereon/ssi-sdk-ext.kms-local'
import { bytesToBase58, hexToBytes } from '@sphereon/ssi-sdk.core'
import { IAgentContext, IKey, TKeyType, VerifiableCredential } from '@veramo/core'
import { asArray } from '@veramo/utils'

import { RequiredAgentMethods, SphereonLdSignature } from '../ld-suites'

import { SphereonBbsBlsSignatureSuite2020 } from './impl/SphereonBbsBlsSignatureSuite2020'

export enum VerificationType {
  Bls12381G2Key2020 = 'Bls12381G2Key2020',
}

export class SphereonBbsBlsSignature2020 extends SphereonLdSignature {
  constructor() {
    super()
  }

  getSupportedVerificationType(): string {
    return VerificationType.Bls12381G2Key2020
  }

  getSupportedVeramoKeyType(): TKeyType {
    return KeyType.Bls12381G2
  }

  getContext(): string {
    return 'https://w3id.org/security/bbs/v1'
  }

  getSuiteForSigning(key: IKey, issuerDid: string, verificationMethodId: string, context: IAgentContext<RequiredAgentMethods>): any {
    const controller = issuerDid

    const id = verificationMethodId

    if (!key.privateKeyHex) {
      throw new Error('Private key must be defined')
    }

    const keyPairOptions = {
      id: id,
      controller: controller,
      privateKeyBase58: bytesToBase58(hexToBytes(key.privateKeyHex)),
      publicKeyBase58: bytesToBase58(hexToBytes(key.publicKeyHex)),
      type: this.getSupportedVerificationType(),
    }

    const bls12381G2KeyPair: Bls12381G2KeyPair = new Bls12381G2KeyPair(keyPairOptions)

    const signatureSuiteOptions = {
      key: bls12381G2KeyPair,
      verificationMethod: verificationMethodId,
    }
    return new SphereonBbsBlsSignatureSuite2020(signatureSuiteOptions)
  }

  preVerificationCredModification(credential: VerifiableCredential): void {
    const vcJson = JSON.stringify(credential)
    if (vcJson.indexOf('BbsBlsSignature2020') > -1) {
      if (vcJson.indexOf(this.getContext()) === -1) {
        credential['@context'] = [...asArray(credential['@context'] || []), this.getContext()]
      }
    }
  }

  getSuiteForVerification(): any {
    return new SphereonBbsBlsSignatureSuite2020()
  }

  // preSigningCredModification(_credential: CredentialPayload): void {}
  preSigningCredModification(): void {}

  // preDidResolutionModification(_didUrl: string, _didDoc: DIDDocument): void {
  preDidResolutionModification(): void {
    // nothing to do here
  }
}
