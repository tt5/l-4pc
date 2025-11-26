import { Title } from '@solidjs/meta';
import LoginForm from '~/components/Auth/LoginForm';

export default function Login() {
  return (
    <>
      <Title>Login - Superstar</Title>
      <h1>Sign in to your account</h1>
      <LoginForm />
    </>
  );
}
