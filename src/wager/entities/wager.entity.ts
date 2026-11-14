import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

@Entity()
export class Wager {
  @PrimaryKey()
  id!: number;

  @Property()
  status!: string;
}
