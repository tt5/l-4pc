import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import "./global.css";

export default () => (
  <Router root={props => (
    <MetaProvider>
      <AuthProvider>
        <UserProvider>
          <Suspense>
            {props.children}
          </Suspense>
        </UserProvider>
      </AuthProvider>
    </MetaProvider>
  )}>
    <FileRoutes />
  </Router>
);
