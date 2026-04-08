import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { AuthProvider } from "./contexts/AuthContext";
import "./global.css";

export default () => (
  <Router root={props => (
    <MetaProvider>
      <AuthProvider>
        <Suspense>
          {props.children}
        </Suspense>
      </AuthProvider>
    </MetaProvider>
  )}>
    <FileRoutes />
  </Router>
);
