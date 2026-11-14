import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
  Index,
} from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'inbox_messages' })
@Unique({ properties: ['consumerName', 'messageId'] })
@Index({ properties: ['createdAt'] })
export class InboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ length: 100 })
  consumerName!: string;

  @Property({ length: 128 })
  messageId!: string;

  @Property()
  processedAt: Date = new Date();

  @Property()
  createdAt: Date = new Date();
}
