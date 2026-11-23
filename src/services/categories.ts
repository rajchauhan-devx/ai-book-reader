import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_CATEGORY = 'Default';
export const CATEGORIES_STORAGE_KEY = '@ai-book-reader/user-categories';

class CategoriesService {
  private cachedCategories: string[] | null = null;

  async getCategories(): Promise<string[]> {
    if (this.cachedCategories) {
      return [...this.cachedCategories];
    }
    try {
      const stored = await AsyncStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure 'Default' is always the first category
          const filtered = parsed.filter(
            c => typeof c === 'string' && c.trim().toLowerCase() !== 'default',
          );
          this.cachedCategories = [DEFAULT_CATEGORY, ...filtered];
          return [...this.cachedCategories];
        }
      }
    } catch {
      // Fallback to default
    }
    this.cachedCategories = [DEFAULT_CATEGORY];
    return [...this.cachedCategories];
  }

  async addCategory(name: string): Promise<string[]> {
    const trimmed = name.trim();
    if (!trimmed) {
      return this.getCategories();
    }
    const current = await this.getCategories();
    const exists = current.some(
      c => c.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!exists) {
      const updated = [...current, trimmed];
      this.cachedCategories = updated;
      await this.save(updated);
      return [...updated];
    }
    return [...current];
  }

  async deleteCategory(name: string): Promise<string[]> {
    if (name.toLowerCase() === DEFAULT_CATEGORY.toLowerCase()) {
      return this.getCategories(); // Cannot delete Default
    }
    const current = await this.getCategories();
    const updated = current.filter(
      c => c.toLowerCase() !== name.toLowerCase(),
    );
    this.cachedCategories = updated;
    await this.save(updated);
    return [...updated];
  }

  async renameCategory(oldName: string, newName: string): Promise<string[]> {
    const trimmed = newName.trim();
    if (!trimmed || oldName.toLowerCase() === DEFAULT_CATEGORY.toLowerCase()) {
      return this.getCategories();
    }
    const current = await this.getCategories();
    const updated = current.map(c =>
      c.toLowerCase() === oldName.toLowerCase() ? trimmed : c,
    );
    this.cachedCategories = updated;
    await this.save(updated);
    return [...updated];
  }

  private async save(categories: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(
        CATEGORIES_STORAGE_KEY,
        JSON.stringify(categories),
      );
    } catch {
      // Ignore storage errors in sandbox
    }
  }

  // Clear cache for unit tests
  _resetCache(): void {
    this.cachedCategories = null;
  }
}

export const categoriesService = new CategoriesService();
