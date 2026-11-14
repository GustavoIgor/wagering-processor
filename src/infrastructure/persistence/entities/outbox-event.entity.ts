import {
  Entity,
  PrimaryKey,
  Property,
  Index,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'outbox_events' })
@Index({ properties: ['status', 'createdAt'] })
export class OutboxEventEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ length: 100 })
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({ length: 20, default: 'PENDING' })
  status!: 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';

  @Property({ default: 0 })
  attempts!: number;

  @Property({ nullable: true })
  publishedAt: Date | null = null;

  @Property({ nullable: true })
  nextAttemptAt: Date | null = null;

  @Property({ length: 1000, nullable: true })
  lastError: string | null = null;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @Property({ length: 128, nullable: true })
  lockedBy: string | null = null;

  @Property({ nullable: true })
  lockedUntil: Date | null = null;
}
