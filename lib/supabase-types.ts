// Minimal Database type fed to `createClient<Database>` so .from() rows infer
// to real shapes instead of `never`. Mirrors db/schema.sql; keep them in sync.
//
// Once the project has a live Supabase project + CLI, swap this for the output
// of `supabase gen types typescript --linked > lib/supabase-types.ts`.

export type Database = {
  public: {
    Tables: {
      dapps: {
        Row: {
          id: string;
          name: string;
          url: string;
          owner: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          url: string;
          owner?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['dapps']['Insert']>;
        Relationships: [];
      };
      dapp_contracts: {
        Row: {
          dapp_id: string;
          contract_address: string;
        };
        Insert: {
          dapp_id: string;
          contract_address: string;
        };
        Update: Partial<Database['public']['Tables']['dapp_contracts']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'dapp_contracts_dapp_id_fkey';
            columns: ['dapp_id'];
            referencedRelation: 'dapps';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
