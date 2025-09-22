-- Create a secure function for anonymous profile creation
CREATE OR REPLACE FUNCTION public.create_anonymous_profile(
  profile_email text,
  profile_name text,
  profile_phone text DEFAULT '',
  profile_orgs text DEFAULT '',
  profile_subscribed boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_profile profiles;
BEGIN
  -- Validate input
  IF profile_email IS NULL OR profile_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  
  IF profile_name IS NULL OR profile_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;
  
  -- Insert the profile with elevated privileges (bypasses RLS)
  INSERT INTO public.profiles (
    email,
    full_name, 
    phone_number,
    organizations,
    user_id,
    subscribed,
    source
  ) VALUES (
    profile_email,
    profile_name,
    profile_phone,
    profile_orgs,
    NULL, -- Always NULL for anonymous profiles
    profile_subscribed,
    'registration'
  )
  RETURNING * INTO result_profile;
  
  -- Return the created profile as JSON
  RETURN row_to_json(result_profile);
END;
$$;

-- Grant execute permission to anon role
GRANT EXECUTE ON FUNCTION public.create_anonymous_profile TO anon;