/**
 * Interface chuẩn cho entity có id (dùng với GenericTable, list, detail).
 */
export interface EntityWithId {
  id: string;
}

/**
 * Interface chuẩn cho service CRUD – dùng làm contract cho các module.
 * Mỗi feature có thể implement interface này với TEntity và TFormValues riêng.
 */
export interface CrudService<TEntity extends EntityWithId, TFormValues = Partial<TEntity>> {
  getList(params?: Record<string, unknown>): Promise<TEntity[]>;
  getById(id: string): Promise<TEntity | null>;
  create(data: TFormValues): Promise<TEntity>;
  update(id: string, data: TFormValues): Promise<TEntity>;
  delete(ids: string[]): Promise<void>;
}

/**
 * Interface rút gọn khi chỉ cần list + delete (ví dụ danh mục đơn giản).
 */
export interface ListDeleteService<TEntity extends EntityWithId> {
  getList(params?: Record<string, unknown>): Promise<TEntity[]>;
  delete(ids: string[]): Promise<void>;
}
