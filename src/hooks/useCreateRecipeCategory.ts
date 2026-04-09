import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recipeCategoriesApi } from '@/api/meals';
import { categoryKeys } from './useCategories';

export function useCreateRecipeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => recipeCategoriesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.recipes() });
    },
  });
}
