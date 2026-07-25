import React from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  Controller,
} from 'react-hook-form';
import DataField, { type DataFieldProps } from './DataField';
import type { DataTypeId } from '@/lib/data-types';

export type RhfDataFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  dataType: DataTypeId;
} & Omit<DataFieldProps, 'value' | 'onChange' | 'error' | 'name' | 'dataType'>;

/**
 * Nối react-hook-form (`Controller`) với [`DataField`](./DataField.tsx).
 * Lỗi validation lấy từ `fieldState.error` của trường tương ứng.
 * Mọi prop `DataField` khác (`placeholder`, `icon`, `options`, …) truyền xuống qua spread.
 */
function RhfDataField<TFieldValues extends FieldValues>({
  control,
  name,
  dataType,
  ...dataFieldRest
}: RhfDataFieldProps<TFieldValues>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <DataField
          dataType={dataType}
          name={field.name}
          value={field.value}
          onChange={(v) => {
            field.onChange(v);
          }}
          error={fieldState.error?.message}
          {...dataFieldRest}
        />
      )}
    />
  );
}

export default RhfDataField;
