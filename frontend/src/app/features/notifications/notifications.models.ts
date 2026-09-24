export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, string | number | boolean | null>;
  is_read: boolean;
  created_at: string;
}
