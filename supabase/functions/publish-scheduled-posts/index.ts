import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Require shared-secret header (function is verify_jwt=false).
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    console.error('publish_scheduled_misconfigured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date().toISOString();

    const { data: scheduledPosts, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, scheduled_at')
      .eq('published', true)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now);

    if (fetchError) {
      console.error('publish_scheduled_fetch_failed', { code: fetchError.code });
      return new Response(JSON.stringify({ success: false, error: 'Fetch failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, published_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const postIds = scheduledPosts.map((p) => p.id);
    const { error: updateError } = await supabase
      .from('blog_posts')
      .update({ scheduled_at: null })
      .in('id', postIds);

    if (updateError) {
      console.error('publish_scheduled_update_failed', { code: updateError.code });
      return new Response(JSON.stringify({ success: false, error: 'Update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('publish_scheduled_ok', { published_count: postIds.length });

    return new Response(
      JSON.stringify({ success: true, published_count: postIds.length, published_ids: postIds }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('publish_scheduled_unhandled', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
