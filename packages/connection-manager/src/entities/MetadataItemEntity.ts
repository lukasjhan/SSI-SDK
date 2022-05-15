import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  ManyToOne
} from 'typeorm'
import { ConnectionEntity } from './ConnectionEntity'

@Entity('ConnectionMetadata')
export class MetadataItemEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('text', { nullable: false })
  label!: string

  @Column('text', { nullable: false })
  value!: string

  @ManyToOne(() => ConnectionEntity, connection => connection.metadata, {
    onDelete: 'CASCADE'
  })
  connection!: ConnectionEntity
}
