{
  description = "example-node-js-flake";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { nixpkgs, flake-utils, ... }: flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = import nixpkgs {
        inherit system;
      };
      foobar = { };
    in
    {
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          cmake
          nixpkgs-fmt
          nodejs
          rclone
          nodePackages.typescript
          nodePackages.typescript-language-server
          nil
        ];
      };
    }
  );
}
