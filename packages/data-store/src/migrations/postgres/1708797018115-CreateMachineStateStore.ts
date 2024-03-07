import { enablePostgresUuidExtension } from '@sphereon/ssi-sdk.core'
import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateMachineStateStore1708797018115 implements MigrationInterface {
  name = 'CreateMachineStateStore1708797018115'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await enablePostgresUuidExtension(queryRunner)
    await queryRunner.query(`
            CREATE TABLE "MachineStateInfoEntity" (
                "instance_id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "session_id" text,
                "latest_state_name" text,
                "machine_name" text NOT NULL,
                "latest_event_type" text NOT NULL,
                "state" text NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "expires_at" TIMESTAMP,
                "completed_at" TIMESTAMP,
                "tenant_id" text,
                CONSTRAINT "PK_MachineStateInfoEntity_id" PRIMARY KEY ("instance_id")
            )
        `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "MachineStateInfoEntity"`)
  }
}
