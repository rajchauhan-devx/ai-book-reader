import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  categoriesService,
  DEFAULT_CATEGORY,
  CATEGORIES_STORAGE_KEY,
} from '../src/services/categories';

describe('CategoriesService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    categoriesService._resetCache();
  });

  it('returns [Default] as the initial categories list', async () => {
    const list = await categoriesService.getCategories();
    expect(list).toEqual([DEFAULT_CATEGORY]);
  });

  it('adds a new category with trimmed whitespace', async () => {
    const updated = await categoriesService.addCategory('  Fantasy  ');
    expect(updated).toEqual([DEFAULT_CATEGORY, 'Fantasy']);
    expect(await categoriesService.getCategories()).toEqual([
      DEFAULT_CATEGORY,
      'Fantasy',
    ]);
  });

  it('does not add empty or whitespace-only categories', async () => {
    const updated = await categoriesService.addCategory('   ');
    expect(updated).toEqual([DEFAULT_CATEGORY]);
  });

  it('does not add duplicate categories case-insensitively', async () => {
    await categoriesService.addCategory('Fantasy');
    const updated = await categoriesService.addCategory('fantasy');
    expect(updated).toEqual([DEFAULT_CATEGORY, 'Fantasy']);
  });

  it('does not add Default again if user tries to add default', async () => {
    const updated = await categoriesService.addCategory('default');
    expect(updated).toEqual([DEFAULT_CATEGORY]);
  });

  it('deletes an existing custom category', async () => {
    await categoriesService.addCategory('Horror');
    await categoriesService.addCategory('Sci-Fi');
    const updated = await categoriesService.deleteCategory('Horror');
    expect(updated).toEqual([DEFAULT_CATEGORY, 'Sci-Fi']);
  });

  it('protects the Default category from being deleted', async () => {
    await categoriesService.addCategory('Horror');
    const updated = await categoriesService.deleteCategory(DEFAULT_CATEGORY);
    expect(updated).toEqual([DEFAULT_CATEGORY, 'Horror']);
  });

  it('renames an existing category', async () => {
    await categoriesService.addCategory('Scifi');
    const updated = await categoriesService.renameCategory('Scifi', 'Sci-Fi');
    expect(updated).toEqual([DEFAULT_CATEGORY, 'Sci-Fi']);
  });

  it('protects the Default category from being renamed', async () => {
    const updated = await categoriesService.renameCategory(
      DEFAULT_CATEGORY,
      'Main',
    );
    expect(updated).toEqual([DEFAULT_CATEGORY]);
  });

  it('restores categories correctly from AsyncStorage', async () => {
    await AsyncStorage.setItem(
      CATEGORIES_STORAGE_KEY,
      JSON.stringify(['Custom1', 'Custom2']),
    );
    categoriesService._resetCache();
    const list = await categoriesService.getCategories();
    expect(list).toEqual([DEFAULT_CATEGORY, 'Custom1', 'Custom2']);
  });
});
